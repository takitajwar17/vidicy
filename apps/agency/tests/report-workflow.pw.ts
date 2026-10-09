import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { once } from "node:events";
import { createClient } from "redis";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { startTestPostgres } from "../src/__tests__/helpers/postgres";

const require = createRequire(import.meta.url);
let postgres: ReturnType<typeof startTestPostgres>;
let pool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
let redis: ReturnType<typeof createClient>;
let server: ChildProcess | undefined;
let directory: string;
let socket: string;
let base: string;
let staffCookie: string;
let outsiderCookie: string;
let applicationId: string;
let mailLog: string;
let control: string;
let serverLog: string;

async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((done) => listener.close(() => done()));
  return address.port;
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  if (!existsSync(".next/BUILD_ID")) throw new Error("Run pnpm build:agency before browser tests.");
  postgres = startTestPostgres();
  pool = postgres.createPool();
  const migrations = resolve("src/db/postgres-migrations");
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await pool.query(readFileSync(join(migrations, file), "utf8"));
  const db = drizzle(pool, { schema });
  const [staff] = await db
    .insert(schema.userTable)
    .values({
      email: "reviewer@example.test",
      firstName: "Test",
      lastName: "Reviewer",
      emailVerified: new Date(),
    })
    .returning();
  const [outsider] = await db
    .insert(schema.userTable)
    .values({ email: "outsider@example.test", emailVerified: new Date() })
    .returning();
  await db
    .insert(schema.agencyTeamMemberTable)
    .values({ userId: staff.id, email: staff.email!, role: "admin", status: "active" });
  const [client] = await db
    .insert(schema.agencyClientTable)
    .values({ name: "Synthetic Client", email: "client@example.test" })
    .returning();
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: staff.id,
      clientId: client.id,
      clientName: client.name,
      clientEmail: null,
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
      agencyStatus: "in_review",
    })
    .returning();
  applicationId = application.id;
  const [applicant] = await db
    .insert(schema.applicantTable)
    .values({ applicationId, name: "Synthetic Applicant", relationship: "primary" })
    .returning();
  const [item] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId,
      applicantId: applicant.id,
      documentName: "Passport",
      description: "Valid passport",
      isRequired: true,
      status: "uploaded",
    })
    .returning();
  const [document] = await db
    .insert(schema.uploadedDocumentTable)
    .values({
      applicationId,
      applicantId: applicant.id,
      checklistItemId: item.id,
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      fileKey: "private-test-only/passport",
      extractionStatus: "completed",
      textContent: "Synthetic passport",
    })
    .returning();
  await db.insert(schema.documentEvaluationTable).values({
    applicationId,
    applicantId: applicant.id,
    overallScore: 70,
    reviewStatus: "complete",
    riskLevel: "medium",
    summary: "Check passport",
    redFlags: [],
    strengths: [],
    recommendations: [],
    docSnapshots: { [item.id]: `${document.id}:test:1:0` },
    itemFeedback: {
      [item.id]: {
        status: "needs_review",
        feedback: 'Please replace passport <script>alert("test")</script>',
        issues: ["Passport details need correction"],
        score: 70,
      },
    },
  });
  directory = mkdtempSync("/tmp/vidicy-browser-");
  socket = join(directory, "redis.sock");
  mailLog = join(directory, "mail.jsonl");
  control = join(directory, "mail-mode");
  serverLog = join(directory, "server.log");
  writeFileSync(mailLog, "");
  writeFileSync(control, "accept");
  execFileSync("redis-server", [
    "--port",
    "0",
    "--unixsocket",
    socket,
    "--unixsocketperm",
    "700",
    "--save",
    "",
    "--appendonly",
    "no",
    "--daemonize",
    "yes",
    "--pidfile",
    join(directory, "redis.pid"),
    "--logfile",
    join(directory, "redis.log"),
  ]);
  redis = createClient({ socket: { path: socket, reconnectStrategy: false } });
  await redis.connect();
  async function session(user: typeof staff) {
    const token = randomUUID();
    const id = createHash("sha256").update(token).digest("hex");
    await redis.set(
      `vidicy:cache:session:${user.id}:${id}`,
      JSON.stringify({
        id,
        userId: user.id,
        user,
        version: 11,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3_600_000,
        authenticationType: "password",
        unreadSupportTicketsCount: 0,
      }),
      { EX: 3600 },
    );
    return `${user.id}:${token}`;
  }
  staffCookie = await session(staff);
  outsiderCookie = await session(outsider);
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const preload = join(directory, "preload.mjs");
  writeFileSync(
    preload,
    `
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
const require = createRequire(${JSON.stringify(resolve("package.json"))});
const client = require('redis').createClient({ socket: { path: ${JSON.stringify(socket)}, reconnectStrategy: false } });
client.on('error', () => {}); await client.connect(); globalThis.__vidicyRedisState = { client };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
 if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
  if (readFileSync(${JSON.stringify(control)}, 'utf8') === 'reject') return Response.json({error:'test rejection'}, {status:503});
  appendFileSync(${JSON.stringify(mailLog)}, JSON.stringify({body: JSON.parse(init.body), key:new Headers(init.headers).get('Idempotency-Key')})+'\\n');
  return Response.json({id:'test-message-accepted'});
 }
 if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return realFetch(input, init);
 throw new Error('External access disabled in isolated browser fixture');
};
`,
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // Stop Next.js from filling absent settings from local application env files.
  for (const file of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    "../../.env",
  ]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (match) env[match[1]] = "";
    }
  }
  Object.assign(env, {
    DATABASE_URL: "",
    PGHOST: pool.options.host,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGPASSWORD: "",
    DB_SQL_LOG: "false",
    REDIS_URL: "redis://unused.test",
    NEXT_PUBLIC_SITE_URL: base,
    GOOGLE_APPLICATION_CREDENTIALS_JSON: "",
    GOOGLE_CLOUD_PROJECT: "",
    RESEND_API_KEY: "isolated-test-key",
    EMAIL_FROM: "reports@example.test",
    EMAIL_FROM_NAME: "Test Agency",
    EMAIL_REPLY_TO: "",
    SENTRY_DSN: "",
  });
  server = spawn(
    process.execPath,
    [
      "--import",
      preload,
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout?.on("data", (data: Buffer) => appendFileSync(serverLog, data));
  server.stderr?.on("data", (data: Buffer) => appendFileSync(serverLog, data));
  await expect
    .poll(
      async () => {
        if (server?.exitCode !== null)
          throw new Error(`Preview exited: ${readFileSync(serverLog, "utf8")}`);
        try {
          return (await fetch(base + "/sign-in")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((done) => setTimeout(done, 5000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (redis?.isOpen) redis.destroy();
  if (socket && existsSync(socket)) execFileSync("redis-cli", ["-s", socket, "SHUTDOWN", "NOSAVE"]);
  await pool?.end();
  postgres?.stop();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test("generate, view, export, and deliver with real auth and a private provider stub", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.goto(`${base}/dashboard/${applicationId}`);
  await pool.query(
    'UPDATE document_evaluation SET "reviewStatus" = $1 WHERE "applicationId" = $2',
    ["incomplete", applicationId],
  );
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "previous review is incomplete" }),
  ).toBeVisible();
  await pool.query(
    'UPDATE document_evaluation SET "reviewStatus" = $1 WHERE "applicationId" = $2',
    ["complete", applicationId],
  );
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "previous review is incomplete" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Client report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Client report", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports\/crep_/);
  await expect(
    page.getByRole("heading", { name: "Client document report", exact: true }),
  ).toBeVisible();
  const reportId = new URL(page.url()).pathname.split("/").pop()!;
  await pool.query(
    'UPDATE document_evaluation SET "reviewStatus" = $1 WHERE "applicationId" = $2',
    ["incomplete", applicationId],
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "This report is out of date" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Send report|Check \/ retry delivery/ }),
  ).toHaveCount(0);
  await pool.query(
    'UPDATE document_evaluation SET "reviewStatus" = $1 WHERE "applicationId" = $2',
    ["complete", applicationId],
  );
  await page.reload();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator('[data-sidebar="sidebar"]')).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Client document report", exact: true }),
  ).toBeVisible();
  const pdf = await page.pdf();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await page.emulateMedia({ media: "screen" });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download report" }).click();
  const downloadedHtml = readFileSync((await (await download).path())!, "utf8");
  expect(downloadedHtml).toContain("Please replace passport");
  expect(downloadedHtml).toContain("&lt;script&gt;");
  expect(downloadedHtml).not.toContain("<script>");
  await expect(page.getByRole("textbox", { name: "Report recipient", exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("textbox", { name: "Report recipient", exact: true })
    .fill("client@example.test");
  await page.getByRole("button", { name: "Save recipient", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send report to client@example.test", exact: true }),
  ).toBeEnabled();
  writeFileSync(control, "reject");
  await page
    .getByRole("button", { name: "Send report to client@example.test", exact: true })
    .click();
  await expect(
    page.getByText("Delivery is pending or its outcome is unknown.", { exact: false }),
  ).toBeVisible();
  const rejected = await pool.query('SELECT status, "sentAt" FROM client_report WHERE id = $1', [
    reportId,
  ]);
  expect(rejected.rows[0].sentAt).toBeNull();
  expect(rejected.rows[0].status).toBe("sending");
  await expect(page.getByRole("button", { name: "Save recipient", exact: true })).toHaveCount(0);
  await pool.query(
    "UPDATE client_report SET \"deliveryStartedAt\" = NOW() - INTERVAL '3 minutes', \"updatedAt\" = NOW() - INTERVAL '3 minutes' WHERE id = $1",
    [reportId],
  );
  writeFileSync(control, "accept");
  await page.reload();
  await page.getByRole("button", { name: "Check / retry delivery", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await pool.query("SELECT status FROM client_report WHERE id = $1", [reportId])).rows[0]
          .status,
    )
    .toBe("sent");
  const messages = readFileSync(mailLog, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(messages).toHaveLength(1);
  expect(messages[0].body.text).toContain("Please replace passport");
  expect(messages[0].key).toBeTruthy();
  await pool.query('UPDATE visa_application SET "clientReportStatus" = $1 WHERE id = $2', [
    "draft",
    applicationId,
  ]);
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "This report is out of date" }),
  ).toContainText("out of date");
  await expect(
    page.getByRole("button", { name: /Send report|Check \/ retry delivery/ }),
  ).toHaveCount(0);
  await context.clearCookies();
  await context.addCookies([{ name: "session", value: outsiderCookie, url: base }]);
  expect((await context.request.get(`${base}/api/client-reports/${reportId}`)).status()).toBe(403);
  await context.clearCookies();
  expect((await context.request.get(`${base}/api/client-reports/${reportId}`)).status()).toBe(403);
});
