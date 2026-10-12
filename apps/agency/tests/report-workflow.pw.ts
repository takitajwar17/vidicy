import { test, expect, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
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
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { startTestPostgres } from "../src/__tests__/helpers/postgres";
import { buildReviewContextHash, buildReviewRouteContext } from "../src/lib/review-context-data";
import { buildRouteAssessment } from "../src/lib/review-rubric";

const require = createRequire(import.meta.url);
let postgres: ReturnType<typeof startTestPostgres>;
let pool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
let redis: ReturnType<typeof createClient>;
let server: ChildProcess | undefined;
let directory: string;
let socket: string;
let base: string;
let staffCookie: string;
let adminCookie: string;
let outsiderCookie: string;
let applicationId: string;
let agencyId: string;
let mailLog: string;
let control: string;
let serverLog: string;

async function refreshCurrentReviewMetadata(targetApplicationId = applicationId) {
  const db = drizzle(pool, { schema });
  const application = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, targetApplicationId),
  });
  if (!application) throw new Error("Missing isolated case");
  const applicants = await db.query.applicantTable.findMany({
    where: eq(schema.applicantTable.applicationId, targetApplicationId),
  });
  const checklistItems = await db.query.checklistItemTable.findMany({
    where: eq(schema.checklistItemTable.applicationId, targetApplicationId),
  });
  const documents = await db.query.uploadedDocumentTable.findMany({
    where: eq(schema.uploadedDocumentTable.applicationId, targetApplicationId),
  });
  const snapshot = { application, applicants, checklistItems, documents };
  for (const applicant of applicants)
    await db
      .update(schema.documentEvaluationTable)
      .set({
        reviewContextHash: buildReviewContextHash(snapshot),
        routeAssessment: buildRouteAssessment({
          context: buildReviewRouteContext({ ...snapshot, applicantId: applicant.id }),
          asOfDate: new Date().toISOString().slice(0, 10),
        }),
      })
      .where(eq(schema.documentEvaluationTable.applicantId, applicant.id));
}

interface DropdownSpacingOptions {
  page: Page;
}

async function expectDropdownSpacing({ page }: DropdownSpacingOptions) {
  const controls = await page
    .locator('select.native-select, button[role="combobox"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const arrow = element.querySelector(":scope > svg")?.getBoundingClientRect();
          const label = element.querySelector(":scope > span")?.getBoundingClientRect();
          return {
            name: element.getAttribute("aria-label") || element.id || element.textContent?.trim(),
            native: element.tagName === "SELECT",
            paddingRight: parseFloat(style.paddingRight),
            backgroundPosition: style.backgroundPositionX,
            backgroundImage: style.backgroundImage,
            arrowInset: arrow ? bounds.right - arrow.right : null,
            textGap: arrow && label ? arrow.left - label.right : null,
          };
        }),
    );
  for (const control of controls) {
    if (control.native) {
      expect(control.paddingRight, control.name).toBeGreaterThanOrEqual(48);
      expect(control.backgroundPosition, control.name).toContain("20px");
      expect(control.backgroundImage, control.name).not.toBe("none");
    } else if (control.arrowInset !== null) {
      expect(control.arrowInset, control.name).toBeGreaterThanOrEqual(19);
      if (control.textGap !== null)
        expect(control.textGap, control.name).toBeGreaterThanOrEqual(11);
    }
  }
}

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
  const [agency] = await db
    .insert(schema.agencyTable)
    .values({ ownerUserId: staff.id, name: "Isolated Test Agency" })
    .returning();
  agencyId = agency.id;
  await db
    .insert(schema.agencyTeamMemberTable)
    .values({ agencyId, userId: staff.id, email: staff.email!, role: "admin", status: "active" });
  const [client] = await db
    .insert(schema.agencyClientTable)
    .values({ agencyId, name: "Synthetic Client", email: "client@example.test" })
    .returning();
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: staff.id,
      agencyId,
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
  await refreshCurrentReviewMetadata();
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
  await expect
    .poll(() => {
      try {
        return execFileSync("redis-cli", ["-s", socket, "ping"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
      } catch {
        return "not-ready";
      }
    })
    .toBe("PONG");
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
  const [admin] = await db
    .insert(schema.userTable)
    .values({
      email: "admin@example.test",
      firstName: "Admin",
      lastName: "Reviewer",
      role: "admin",
      emailVerified: new Date(),
    })
    .returning();
  adminCookie = await session(admin);
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

test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && serverLog && existsSync(serverLog))
    await info.attach("isolated-server-log", {
      body: readFileSync(serverLog),
      contentType: "text/plain",
    });
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

test("profile is ready before session refresh and keeps drafts during slow or failed refreshes", async ({
  page,
  context,
}, info) => {
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  // Check the initial HTML before any client session store or effects can run.
  const initial = await context.request.get(base + "/settings");
  expect(initial.status()).toBe(200);
  expect(await initial.text()).toContain("Profile Settings");

  let requests = 0;
  let fail = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/get-session", async (route) => {
    requests++;
    if (fail) {
      await route.fulfill({ status: 503, json: { error: "Temporary session refresh failure" } });
      return;
    }
    await held;
    await route.continue();
  });
  try {
    await page.goto(base + "/settings");
    await expect
      .poll(async () => {
        // Wait for the provider's focus listener, not a fixed hydration delay.
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        return requests;
      })
      .toBeGreaterThan(0);
    const firstName = page.getByRole("textbox", { name: "First Name", exact: true });
    await expect(firstName).toBeVisible();
    await expect(firstName).toHaveValue("Test");
    await firstName.fill("Unsaved profile draft");
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
    const refreshed = page.waitForResponse((response) =>
      response.url().endsWith("/api/get-session"),
    );
    release();
    await refreshed;
    await expect(firstName).toHaveValue("Unsaved profile draft");

    fail = true;
    const failed = page.waitForResponse(
      (response) => response.url().endsWith("/api/get-session") && response.status() === 503,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await failed;
    await expect(firstName).toBeVisible();
    await expect(firstName).toHaveValue("Unsaved profile draft");
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(firstName).toBeVisible();
    await page.screenshot({
      path: info.outputPath("profile-ready-with-failed-session-refresh.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
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
  const beforeAcceptance = await pool.query(
    'SELECT id FROM agency_team_member WHERE "userId" = $1',
    [outsiderCookie.split(":")[0]],
  );
  expect(beforeAcceptance.rows).toEqual([]);
  // Explicit fixture membership represents acceptance; a report request cannot enroll users.
  await drizzle(pool, { schema })
    .insert(schema.agencyTeamMemberTable)
    .values({
      agencyId,
      userId: outsiderCookie.split(":")[0],
      email: "outsider@example.test",
      role: "member",
      status: "active",
    });
  expect((await context.request.get(`${base}/api/client-reports/${reportId}`)).status()).toBe(200);
  const joined = await pool.query(
    'SELECT role, status FROM agency_team_member WHERE "userId" = $1',
    [outsiderCookie.split(":")[0]],
  );
  expect(joined.rows).toEqual([{ role: "member", status: "active" }]);
  await pool.query('UPDATE agency_team_member SET status = $1 WHERE "userId" = $2', [
    "disabled",
    outsiderCookie.split(":")[0],
  ]);
  expect((await context.request.get(`${base}/api/client-reports/${reportId}`)).status()).toBe(403);
  await context.clearCookies();
  expect((await context.request.get(`${base}/api/client-reports/${reportId}`)).status()).toBe(403);
});

test("review status survives reloads and shows completion and failure", async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: "session", value: staffCookie, url: base }]);
  const db = drizzle(pool, { schema });
  const applicant = await db.query.applicantTable.findFirst({
    where: eq(schema.applicantTable.applicationId, applicationId),
  });
  const staff = await db.query.agencyTeamMemberTable.findFirst({
    where: eq(schema.agencyTeamMemberTable.status, "active"),
  });
  const [job] = await db
    .insert(schema.reviewJobTable)
    .values({ applicationId, applicantId: applicant!.id, userId: staff!.userId!, status: "queued" })
    .returning();
  try {
    await page.goto(`${base}/dashboard/${applicationId}`);
    await expect(page.getByRole("button", { name: "Review queued", exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: "Review queued", exact: true })).toBeDisabled();
    await db
      .update(schema.reviewJobTable)
      .set({ status: "running" })
      .where(eq(schema.reviewJobTable.id, job.id));
    await expect(page.getByRole("button", { name: "Reviewing...", exact: true })).toBeDisabled();
    await db
      .update(schema.reviewJobTable)
      .set({ status: "succeeded" })
      .where(eq(schema.reviewJobTable.id, job.id));
    await expect(page.getByRole("button", { name: "Re-run Review", exact: true })).toBeEnabled();
    await db
      .update(schema.reviewJobTable)
      .set({ status: "failed", error: "Review failed" })
      .where(eq(schema.reviewJobTable.id, job.id));
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Review failed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-run Review", exact: true })).toBeEnabled();
  } finally {
    await db.delete(schema.reviewJobTable).where(eq(schema.reviewJobTable.id, job.id));
  }
  // Cloud access is disabled in this fixture. An uncertain enqueue must still
  // show the durable job, without requiring a second click or page reload.
  await page.reload();
  await page.getByRole("button", { name: "Re-run Review", exact: true }).click();
  await expect(
    page.getByText(
      "Review request was saved, but delivery is not confirmed. It will retry automatically.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review queued", exact: true })).toBeDisabled();
  await db
    .delete(schema.reviewJobTable)
    .where(eq(schema.reviewJobTable.applicationId, applicationId));
});

test("review workspace links findings to evidence and keeps actions usable at small widths", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  const db = drizzle(pool, { schema });
  const passport = await db.query.uploadedDocumentTable.findFirst({
    where: eq(schema.uploadedDocumentTable.applicationId, applicationId),
  });
  if (!passport?.applicantId) throw new Error("Missing isolated applicant");
  await db
    .delete(schema.reviewIssueTable)
    .where(eq(schema.reviewIssueTable.applicationId, applicationId));
  await db
    .update(schema.applicantTable)
    .set({ name: "Alex Morgan" })
    .where(eq(schema.applicantTable.id, passport.applicantId));
  await db
    .update(schema.visaApplicationTable)
    .set({
      destinationCountry: "Germany",
      visaType: "Student visa",
      caseNumber: "DEMO-1002",
      agencyStatus: "in_review",
    })
    .where(eq(schema.visaApplicationTable.id, applicationId));
  const [flight] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId,
      applicantId: passport.applicantId,
      documentName: "Travel itinerary",
      description: "Travel to Germany",
      isRequired: true,
      status: "uploaded",
    })
    .returning();
  const [missing] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId,
      applicantId: passport.applicantId,
      documentName: "Health insurance",
      description: "Upload proof of cover",
      isRequired: true,
      status: "missing",
    })
    .returning();
  const [itinerary] = await db
    .insert(schema.uploadedDocumentTable)
    .values({
      applicationId,
      applicantId: passport.applicantId,
      checklistItemId: flight.id,
      fileName: "itinerary.pdf",
      fileKey: "private-test-only/itinerary",
      mimeType: "application/pdf",
      fileSize: 1000,
      pageCount: 2,
      extractionStatus: "completed",
      textContent: "Synthetic itinerary: Dhaka to London",
    })
    .returning();
  const items = await db.query.checklistItemTable.findMany({
    where: eq(schema.checklistItemTable.applicationId, applicationId),
  });
  const testDocuments = [passport, itinerary];
  await db
    .update(schema.documentEvaluationTable)
    .set({
      overallScore: 8,
      riskLevel: "high",
      reviewStatus: "complete",
      docSnapshots: Object.fromEntries(
        items.map((item) => [
          item.id,
          testDocuments.find((document) => document.checklistItemId === item.id)?.id
            ? `${testDocuments.find((document) => document.checklistItemId === item.id)!.id}:test:1:0`
            : "missing",
        ]),
      ),
      itemFeedback: Object.fromEntries(
        items.map((item) => [
          item.id,
          { status: "needs_review", feedback: "Check this synthetic evidence." },
        ]),
      ),
    })
    .where(eq(schema.documentEvaluationTable.applicationId, applicationId));
  await refreshCurrentReviewMetadata();
  const [destination] = await db
    .insert(schema.reviewIssueTable)
    .values({
      applicationId,
      applicantId: passport.applicantId,
      checklistItemId: flight.id,
      documentId: itinerary.id,
      title: "Destination does not match",
      description: "The itinerary ends in London. The application is for Germany.",
      recommendation: "Provide a travel itinerary to Germany.",
      severity: "high",
      source: "ai",
    })
    .returning();
  const [missingIssue] = await db
    .insert(schema.reviewIssueTable)
    .values({
      applicationId,
      checklistItemId: missing.id,
      title: "Health insurance missing",
      description: "Required health insurance has not been uploaded.",
      recommendation: "Upload proof of cover.",
      severity: "high",
      source: "ai",
    })
    .returning();
  const [nameIssue] = await db
    .insert(schema.reviewIssueTable)
    .values({
      applicationId,
      documentId: passport.id,
      checklistItemId: passport.checklistItemId,
      title: "Passport name needs review",
      description: "Confirm the passport name matches the application.",
      severity: "medium",
      source: "reviewer",
    })
    .returning();
  await db.insert(schema.reviewIssueTable).values([
    ...[
      "Financial proof needs review",
      "Admission letter missing",
      "Passport scan incomplete",
      "Accommodation evidence missing",
      "Visa form needs review",
    ].map((title) => ({
      applicationId,
      title,
      description: "Check this required evidence before you complete the review.",
      recommendation: "Ask the client for the correct document.",
      severity: "high",
      source: "ai",
    })),
    ...[
      "Funding dates need review",
      "Flight booking not confirmed",
      "Course duration unclear",
      "Translation missing",
    ].map((title) => ({
      applicationId,
      title,
      description: "Confirm these details against the current evidence.",
      severity: "medium",
      source: "ai",
    })),
  ]);
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.setContent(
    `<style>body{font:14px Arial;padding:35px;color:#182832}h1{font-size:24px}.page{break-after:page}table{border-collapse:collapse;width:100%}td,th{padding:15px;border-bottom:1px solid #ddd;text-align:left}</style><div class="page"><h1>TRAVEL ITINERARY</h1><p>Synthetic test document</p><p>Passenger: Alex Morgan</p><table><tr><th>From</th><th>To</th><th>Date</th></tr><tr><td>Dhaka</td><td>London</td><td>10 September</td></tr></table></div><div><h1>Booking details</h1><p>Page two of the isolated preview fixture.</p></div>`,
  );
  const pdf = await page.pdf({ format: "A4" });
  await page.route("**/api/document-preview/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: pdf }),
  );
  await page.goto(`${base}/dashboard/applications`);
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(sidebar).toBeVisible();
  const sharedSidebar = await sidebar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, width: style.width };
  });
  const topBar = page.locator('header:has(nav[aria-label="breadcrumb"])');
  const sharedTopBar = await topBar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: style.height, background: style.backgroundColor, border: style.borderBottom };
  });
  await page.goto(`${base}/dashboard/${applicationId}?issue=${destination.id}`);
  await expect(topBar).toBeVisible();
  expect(
    await topBar.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        background: style.backgroundColor,
        border: style.borderBottom,
      };
    }),
  ).toEqual(sharedTopBar);
  await expect(topBar.getByRole("link", { name: "Applications", exact: true })).toHaveAttribute(
    "href",
    "/dashboard/applications",
  );
  await expect(sidebar).toBeVisible();
  expect(
    await sidebar.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, width: style.width };
    }),
  ).toEqual(sharedSidebar);
  const table = page.getByRole("table", { name: "Review issues" });
  await expect(page.getByRole("region", { name: "Selected issue" })).not.toContainText(
    "AI finding",
  );
  await expect(page.getByRole("heading", { name: "Alex Morgan", exact: true })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(13);
  await expect(
    page.getByRole("button", { name: "Mark ready to submit", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Supporting evidence" }).getByRole("combobox"),
  ).toHaveValue(itinerary.id);
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await expectDropdownSpacing({ page });
  await expect(page.getByRole("combobox", { name: "Filter issue status" })).toHaveCSS(
    "height",
    "32px",
  );
  await expect(page.locator("canvas")).toHaveCount(1);
  const output = resolve("output/verification");
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, "case-workspace-desktop.png"), fullPage: true });
  await page
    .getByRole("combobox", { name: "Filter issue status" })
    .screenshot({ path: join(output, "issue-filter-spacing.png") });
  await page
    .getByRole("combobox", { name: "Select evidence document" })
    .screenshot({ path: join(output, "evidence-dropdown-spacing.png") });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fit to width", exact: true })).toHaveText("125%");
  await page.getByRole("button", { name: "Rotate page", exact: true }).click();
  await page.getByRole("button", { name: "Fit to width", exact: true }).click();
  await page.getByRole("button", { name: /^High / }).click();
  await expect(table.getByRole("row")).toHaveCount(8);
  await page.getByRole("textbox", { name: "Search issues" }).fill("health");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByText("This finding has no linked file.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^All / }).click();
  await page.getByRole("textbox", { name: "Search issues" }).fill("");
  const nameButton = page.getByRole("button", {
    name: "Review issue: Passport name needs review",
    exact: true,
  });
  await nameButton.focus();
  await nameButton.press("Enter");
  await expect(page.getByRole("combobox", { name: "Select evidence document" })).toHaveValue(
    passport.id,
  );
  await expect(page).toHaveURL(new RegExp(`issue=${nameIssue.id}`));
  await page.reload();
  await expect(page.getByRole("region", { name: "Selected issue" })).toContainText(
    "Passport name needs review",
  );
  await page.getByRole("button", { name: "Dismiss issue", exact: true }).click();
  await expect(table.getByRole("row")).toHaveCount(12);
  await page.getByRole("combobox", { name: "Filter issue status" }).selectOption("dismissed");
  await expect(table).toContainText("Passport name needs review");
  await expect(page.getByRole("button", { name: "Dismiss issue", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "Checklist", exact: true }).click();
  await expect(page.getByText("Required files uploaded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  const passportFiles = page.getByRole("list", {
    name: "Uploaded files for Passport",
    exact: true,
  });
  const previewPassport = passportFiles.getByRole("button", {
    name: `Preview document: ${passport.fileName}`,
    exact: true,
  });
  await expect(previewPassport).toBeVisible();
  await expect(passportFiles).not.toContainText(itinerary.fileName);
  const checklistOutput = join(output, "checklist-files");
  mkdirSync(checklistOutput, { recursive: true });
  for (const width of [1586, 390, 320]) {
    await page.setViewportSize({ width, height: 992 });
    await expect(previewPassport).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: join(checklistOutput, `checklist-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  await previewPassport.focus();
  await previewPassport.press("Enter");
  const filePreview = page.getByRole("dialog", { name: passport.fileName, exact: true });
  await expect(filePreview).toBeVisible();
  await expect(filePreview.locator("canvas")).toHaveCount(2);
  const downloadPromise = page.waitForEvent("download");
  await filePreview.getByRole("link", { name: "Download", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(passport.fileName);
  await page.keyboard.press("Escape");
  await expect(filePreview).toHaveCount(0);
  const previewUrl = `${base}/api/document-preview/${passport.id}`;
  await page.route(previewUrl, (route) => route.fulfill({ status: 503 }));
  await previewPassport.focus();
  await previewPassport.press("Space");
  await expect(filePreview.getByText("Preview unavailable", { exact: true })).toBeVisible();
  await expect(filePreview.getByRole("link", { name: "Download", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.unroute(previewUrl);
  await previewPassport.click();
  await expect(filePreview.locator("canvas")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Case sections" }).getByRole("tab")).toHaveText([
    "Review",
    "Checklist",
    "Details",
  ]);
  await expect(page.getByRole("heading", { name: "Applicant records", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Supporting evidence" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Severity", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/tab=details/);
  for (const width of [1586, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole("tab", { name: "Details", exact: true })).toBeInViewport();
    await page.screenshot({
      path: join(checklistOutput, `case-details-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Case created", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Supporting evidence" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Review issues" })).toHaveCount(0);
  await expect(page.getByText("Tracked issues", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: join(checklistOutput, "activity-320.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Add issue", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add issue", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Severity", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter issue status" }).selectOption("open");
  await page
    .getByRole("button", { name: "Review issue: Health insurance missing", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`issue=${missingIssue.id}`));
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Review issues", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width < 900) {
      const review = await page
        .getByRole("tabpanel", { name: "Review", exact: true })
        .boundingBox();
      const evidence = await page
        .getByRole("region", { name: "Supporting evidence" })
        .boundingBox();
      expect(review).not.toBeNull();
      expect(evidence).not.toBeNull();
      expect(evidence!.y).toBeGreaterThanOrEqual(review!.y + review!.height);
    }
    await page.screenshot({ path: join(output, `case-workspace-${width}.png`), fullPage: true });
  }
  for (const [status, label] of [
    ["intake", "Intake"],
    ["in_review", "In Review"],
    ["needs_client", "Needs Client"],
    ["ready_to_submit", "Ready to Submit"],
  ]) {
    await db
      .update(schema.visaApplicationTable)
      .set({ agencyStatus: status })
      .where(eq(schema.visaApplicationTable.id, applicationId));
    for (const width of [1586, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      const statusControl = page.getByRole("combobox", { name: "Case status", exact: true });
      await expect(statusControl).toHaveText(label);
      await expect(statusControl).toHaveCSS("height", "28px");
      const bounds = await statusControl.evaluate((element) => {
        const label = element.querySelector("span")!;
        const rect = element.getBoundingClientRect();
        return {
          labelWidth: label.clientWidth,
          fullLabelWidth: label.scrollWidth,
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        };
      });
      expect(bounds.labelWidth, `${label} at ${width}px`).toBeGreaterThanOrEqual(
        bounds.fullLabelWidth,
      );
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
      await expectDropdownSpacing({ page });
      await statusControl.screenshot({ path: join(output, `case-status-${status}-${width}.png`) });
    }
  }
  await page.getByRole("button", { name: "Add issue", exact: true }).click();
  await page.getByLabel("Reviewer issue", { exact: true }).fill("Check invitation letter");
  await page.getByLabel("Description", { exact: true }).fill("The invitation needs a signature.");
  await page.getByLabel("Client action", { exact: true }).fill("Upload a signed invitation.");
  await page
    .getByRole("dialog", { name: "Add issue", exact: true })
    .getByRole("button", { name: "Add issue", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Add issue", exact: true })).toHaveCount(0);
  await expect(page.getByText("Issue added.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review issue: Check invitation letter", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review issue: Check invitation letter", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("long review findings scroll while the left readiness bar stays fixed", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const db = drizzle(pool, { schema });
  const title = "No evidence of ties to the home country or prior immigration compliance.";
  const description = Array.from(
    { length: 12 },
    (_, index) => `Evidence ${index + 1}: Confirm the applicant's home address and employment.`,
  ).join("\n\n");
  const [issue] = await db
    .insert(schema.reviewIssueTable)
    .values({
      applicationId,
      title,
      description,
      recommendation: `${description}\n\nUpload all supporting evidence before submission.`,
      severity: "high",
      source: "reviewer",
    })
    .returning();
  await db
    .update(schema.documentEvaluationTable)
    .set({ reviewStatus: "incomplete" })
    .where(eq(schema.documentEvaluationTable.applicationId, applicationId));
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const output = resolve("output/verification");
  mkdirSync(output, { recursive: true });
  for (const [width, height] of [
    [1280, 600],
    [1024, 500],
    [390, 600],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/dashboard/${applicationId}?issue=${issue.id}`);
    const pane = page.getByRole("tabpanel", { name: "Review", exact: true });
    const panel = page.getByLabel("Review findings", { exact: true });
    const readiness = page.getByRole("region", { name: "Review readiness", exact: true });
    const detail = page.getByRole("region", { name: "Selected issue" });
    const dismiss = detail.getByRole("button", { name: "Dismiss issue", exact: true });
    await expect(panel).toHaveCSS("scrollbar-width", "none");
    await expect(detail.getByRole("heading", { name: title, exact: true })).toBeAttached();
    await readiness.scrollIntoViewIfNeeded();
    const before = await readiness.boundingBox();
    const paneBounds = await pane.boundingBox();
    expect(before!.x).toBe(paneBounds!.x);
    expect(before!.width).toBe(paneBounds!.width);
    expect(Math.abs(before!.y + before!.height - paneBounds!.y - paneBounds!.height)).toBeLessThan(
      2,
    );
    if (width >= 900) {
      const bounds = await panel.boundingBox();
      if (!bounds) throw new Error("Review panel is not visible");
      await page.mouse.move(bounds.x + 10, bounds.y + 10);
      await page.mouse.wheel(0, 5000);
      await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    } else {
      await dismiss.scrollIntoViewIfNeeded();
    }
    await expect(dismiss).toBeInViewport({ ratio: 1 });
    const after = await readiness.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    await expect(
      readiness.getByRole("button", { name: "Mark ready to submit", exact: true }),
    ).toBeInViewport();
    const recommendation = detail.getByText("Upload all supporting evidence before submission.", {
      exact: false,
    });
    await recommendation.scrollIntoViewIfNeeded();
    await expect(recommendation).toBeInViewport();
    await dismiss.scrollIntoViewIfNeeded();
    await dismiss.hover();
    await page.screenshot({ path: join(output, `review-scroll-${width}x${height}.png`) });
  }
  expect(errors).toEqual([]);
});

test("dashboard uses real coverage, attention filters, next actions, and responsive layouts", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const db = drizzle(pool, { schema });
  const staffId = staffCookie.split(":")[0];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const nextWeek = new Date(`${today}T00:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 3);
  const clients = await db
    .insert(schema.agencyClientTable)
    .values(Array.from({ length: 9 }, (_, index) => ({ agencyId, name: `Queue Client ${index}` })))
    .returning();
  const fixtureRows = await db
    .insert(schema.visaApplicationTable)
    .values(
      Array.from({ length: 9 }, (_, index) => ({
        userId: staffId,
        agencyId,
        clientId: clients[index].id,
        clientName: `Queue Client ${index}`,
        caseNumber: `QUEUE-${index}`,
        destinationCountry: "Germany",
        visaType: "Student visa",
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        embassy: "Dhaka",
        agencyStatus: index === 0 ? "needs_client" : "intake",
        assignedReviewerId: index === 1 ? null : staffId,
        dueAt: index === 0 ? yesterday : index === 1 ? nextWeek : null,
      })),
    )
    .returning();
  const [applicant] = await db
    .insert(schema.applicantTable)
    .values({
      applicationId: fixtureRows[0].id,
      name: "Queue Applicant",
      relationship: "primary",
    })
    .returning();
  const items = await db
    .insert(schema.checklistItemTable)
    .values([
      {
        applicationId: fixtureRows[0].id,
        applicantId: applicant.id,
        documentName: "Passport",
        description: "Required",
        isRequired: true,
      },
      {
        applicationId: fixtureRows[0].id,
        applicantId: applicant.id,
        documentName: "Funding evidence",
        description: "Required",
        isRequired: true,
      },
    ])
    .returning();
  await db.insert(schema.uploadedDocumentTable).values(
    [1, 2].map((index) => ({
      applicationId: fixtureRows[0].id,
      applicantId: applicant.id,
      checklistItemId: items[0].id,
      fileName: `passport-${index}.pdf`,
      fileKey: `dashboard/passport-${index}`,
      mimeType: "application/pdf",
      fileSize: 100,
      extractionStatus: "completed" as const,
      textContent: "Readable synthetic passport evidence",
    })),
  );
  await db
    .update(schema.visaApplicationTable)
    .set({ agencyStatus: "ready_to_submit", assignedReviewerId: staffId })
    .where(eq(schema.visaApplicationTable.id, applicationId));
  await db
    .update(schema.documentEvaluationTable)
    .set({ reviewStatus: "incomplete" })
    .where(eq(schema.documentEvaluationTable.applicationId, applicationId));
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.setViewportSize({ width: 1586, height: 1000 });
  await page.goto(`${base}/dashboard`);
  const queue = page.getByRole("table", { name: "Client file work queue" });
  await expect(page.getByRole("button", { name: /^Client files:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Needs attention", exact: true })).toBeVisible();
  await expect(page.getByText("Most repeated issues", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Files moving this week", { exact: true })).toHaveCount(0);
  await expect(queue.getByRole("row")).toHaveCount(9);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(queue.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: /Unassigned.*Choose a reviewer/ }).click();
  await expect(page).toHaveURL(/attention=unassigned/);
  await expect(queue).toContainText("QUEUE-1");
  await expect(queue.getByRole("row")).toHaveCount(2);
  await expect(queue.getByRole("link", { name: "Assign reviewer", exact: true })).toHaveAttribute(
    "href",
    `/dashboard/${fixtureRows[1].id}?tab=review`,
  );
  await page.reload();
  await expect(queue).toContainText("QUEUE-1");
  await page.getByRole("button", { name: /Past due.*Due date passed/ }).click();
  await expect(page).toHaveURL(/attention=overdue/);
  const row = queue.getByRole("row").filter({ hasText: "QUEUE-0" });
  await expect(row).toContainText("1 / 2");
  await expect(
    row.getByRole("link", { name: "Review available documents", exact: true }),
  ).toHaveAttribute("href", `/dashboard/${fixtureRows[0].id}?tab=review`);
  await row.getByRole("link", { name: "Review available documents", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.getByRole("tab", { name: "Checklist", exact: true }).click();
  await expect(page.getByText("Funding evidence", { exact: true }).first()).toBeVisible();
  await page.goBack();
  await expect(queue).toContainText("QUEUE-0");
  await page.getByRole("button", { name: /marked-ready.*readiness check/ }).click();
  const statusFilters = page.locator('[aria-label="Case status filters"]');
  await expect(statusFilters.getByRole("button", { name: /^Marked ready/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(statusFilters.getByRole("button", { name: /^All / })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page).toHaveURL(/status=ready_to_submit/);
  await expect(queue.getByRole("link", { name: "Recheck readiness", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search client files", exact: true })
    .fill("Queue Applicant");
  await expect(queue.getByRole("row")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Sort client files", exact: true })
    .selectOption("updated");
  await expect(page).toHaveURL(/sort=updated/);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Search client files", exact: true })).toHaveValue(
    "Queue Applicant",
  );
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  const output = resolve("output/verification/dashboard");
  mkdirSync(output, { recursive: true });
  for (const width of [1586, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectDropdownSpacing({ page });
    if (width < 768) {
      const mobileQueue = page.getByRole("list", { name: "Client file work queue", exact: true });
      expect(
        (await page
          .getByRole("textbox", { name: "Search client files", exact: true })
          .boundingBox())!.width,
      ).toBeGreaterThan(220);
      await expect(mobileQueue.getByRole("listitem")).toHaveCount(8);
      await expect(
        mobileQueue.getByRole("link", { name: "Recheck readiness", exact: true }),
      ).toBeVisible();
    }
    await page.screenshot({ path: join(output, `dashboard-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: join(output, "dashboard-390-dark.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("shared styles work across pages, forms, menus, and themes", async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const output = resolve("output/verification/app-style");
  mkdirSync(output, { recursive: true });
  const routes = [
    ["/dashboard", "Dashboard"],
    ["/dashboard/applications", "Applications"],
    ["/dashboard/clients", "Clients"],
    ["/dashboard/documents", "Documents"],
    ["/dashboard/issues", "Issues"],
    ["/dashboard/team", "Team"],
    ["/dashboard/reports", "Reports"],
    ["/dashboard/announcements", "Announcements"],
    ["/dashboard/applications/new", "New client file"],
    ["/settings", "Profile"],
    ["/settings/security", "Security"],
    ["/settings/sessions", "Sessions"],
  ] as const;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const [path, heading] of routes) {
      const response = await page.goto(base + path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
      await expectDropdownSpacing({ page });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} at ${width}px`,
      ).toBe(true);
      await page.screenshot({
        path: join(output, `${path.replaceAll("/", "-")}-${width}.png`),
        animations: "disabled",
      });
    }
    await page.goto(base + "/dashboard/team");
    if (width < 768) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
      await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).not.toBeVisible();
    }
    await page.getByRole("link", { name: "Invite staff", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/agency#invitations$/);
    await expect(page.getByLabel("Email address (optional)", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create invitation", exact: true }),
    ).toBeEnabled();
    await expectDropdownSpacing({ page });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  for (const [path, name] of [
    ["/dashboard", "dashboard"],
    [`/dashboard/${applicationId}`, "review"],
    ["/settings", "settings"],
  ]) {
    await page.goto(base + path);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectDropdownSpacing({ page });
    await page.screenshot({ path: join(output, `${name}-dark.png`), animations: "disabled" });
  }
  await context.clearCookies();
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of ["/sign-in", "/sign-up", "/forgot-password", "/enterprise", "/"]) {
      const response = await page.goto(base + path);
      expect(response?.status(), path).toBe(200);
      if (path === "/forgot-password") {
        await expect(
          page.getByRole("heading", { name: "Forgot password", exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} at ${width}px`,
      ).toBe(true);
      await expectDropdownSpacing({ page });
      if (path === "/") {
        await expect(page.locator("h1 span").last()).toHaveCSS("opacity", "1");
      }
      await page.screenshot({
        animations: "disabled",
        path: join(output, `${path === "/" ? "home" : path.slice(1)}-${width}.png`),
      });
    }
  }
  expect(errors).toEqual([]);
});

test("UI fixes cover admin, recovery, accessible controls, and narrow layouts", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  const db = drizzle(pool, { schema });
  const staffId = staffCookie.split(":")[0];
  await db.insert(schema.enterpriseInquiryTable).values({
    name: "Test Inquiry",
    email: "inquiry@example.test",
    company: "Test Agency",
    message: "Please show the full inquiry on a phone.",
  });
  const [ticket] = await db
    .insert(schema.supportTicketTable)
    .values({
      userId: staffId,
      subject: "UI test conversation",
      description: "Review this test conversation.",
      category: "bug",
      priority: "high",
    })
    .returning();
  const output = resolve("output/verification/ui-fixes");
  mkdirSync(output, { recursive: true });
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.goto(base + "/dashboard/applications/new");
  for (const name of [
    "Client name",
    "Client email",
    "Applicant name",
    "Received date",
    "Internal due date",
  ])
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  for (const name of [
    "Passport country",
    "Applying from",
    "Destination",
    "Visa type",
    "Priority",
    "Reviewer",
  ])
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(1);
  await page.getByRole("switch", { name: "Previously approved", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Previously approved visa type", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Previously approved year", exact: true }),
  ).toBeVisible();
  await page.goto(base + `/dashboard/${applicationId}`);
  await expect(page.locator('[data-sidebar="menu-button"][data-active="true"]')).toHaveCount(1);
  await expect(page.locator('a[aria-current="page"][href="/dashboard/applications"]')).toHaveCount(
    1,
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + "/settings");
  for (const name of ["Profile", "Security", "Sessions"]) {
    const box = await page.getByRole("tab", { name, exact: true }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.goto(base + `/dashboard/support/${ticket.id}`);
  await expect(page.getByRole("heading", { level: 1, name: ticket.subject })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach images" })).toBeVisible();
  const reply = page.getByRole("textbox", { name: "Reply message" });
  await reply.fill("First line\nSecond line\nThird line");
  expect((await reply.boundingBox())!.height).toBeGreaterThanOrEqual(80);
  await expect(page.getByRole("button", { name: "Send reply" })).toBeEnabled();
  await page.screenshot({
    path: join(output, "support-phone.png"),
    fullPage: true,
    animations: "disabled",
  });
  await context.addCookies([{ name: "session", value: adminCookie, url: base }]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of [
      "/admin",
      "/admin/enterprise",
      "/admin/users",
      `/admin/users/${staffId}`,
      `/admin/users/${staffId}/applications/${applicationId}`,
      "/admin/support",
      "/admin/status",
    ]) {
      expect((await page.goto(base + path))?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toHaveCount(1);
      await expectDropdownSpacing({ page });
      expect(
        await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth),
        path,
      ).toBe(true);
      if (path === "/admin/enterprise") {
        const save = page.getByRole("button", { name: "Save changes" });
        await save.scrollIntoViewIfNeeded();
        const box = await save.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await expect(page.getByRole("textbox", { name: "Internal note" })).toBeVisible();
        await page.screenshot({
          path: join(output, `enterprise-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  await page.goto(base + "/admin/support");
  await page.getByText(ticket.subject, { exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete conversation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conversation options" })).toBeVisible();
  await expectDropdownSpacing({ page });
  await expect(page.getByRole("button", { name: "Send reply" })).toBeDisabled();
  await context.clearCookies();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/reset-password", "/reset-password?token=expired-ui-token"]) {
    expect((await page.goto(base + path))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Request a new reset link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  }
  // Hold the action request to verify visible, disabled pending states without sending email or changing a password.
  await redis.set("vidicy:cache:password-reset:ui-test-token", "{}", { EX: 600 });
  for (const path of ["/forgot-password", "/reset-password?token=ui-test-token"]) {
    await page.goto(base + path);
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) return;
      await route.continue();
    });
    if (path === "/forgot-password")
      await page.getByRole("textbox", { name: "Email", exact: true }).fill("reviewer@example.test");
    else {
      await page.getByLabel("New Password", { exact: true }).fill("test-password-123");
      await page.getByLabel("Confirm Password", { exact: true }).fill("test-password-123");
    }
    await page
      .getByRole("button", {
        name: path === "/forgot-password" ? "Send reset instructions" : "Reset password",
        exact: true,
      })
      .click();
    const pending = page.getByRole("button", {
      name: path === "/forgot-password" ? "Sending instructions…" : "Resetting password…",
      exact: true,
    });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  for (let count = 0; count < 3; count++) {
    await page.goto(base + "/sign-in");
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.locator("svg[aria-hidden=true] path").first()).toHaveCSS("opacity", "0.4");
  }
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator("main > section").first()).toHaveCSS(
    "background-image",
    /rgb\(251, 252, 250\)/,
  );
  const secondary = page.locator(".public-button-secondary").first();
  await expect(secondary).toBeVisible();
  const colours = await secondary.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
  }));
  expect(colours.background).toBe("rgb(251, 252, 250)");
  expect(colours.foreground).toBe("rgb(23, 40, 44)");
  await page.screenshot({
    path: join(output, "home-dark-reduced-motion.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("sign-in background moves and respects reduced motion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/sign-in");
  const path = page.locator('svg:has(title:text-is("Background Paths")) path').first();
  await expect(path).toBeVisible();
  const opacity = () => path.evaluate((element) => getComputedStyle(element).opacity);
  const initial = await opacity();
  await expect.poll(opacity).not.toBe(initial);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(opacity).toBe("0.4");
  const stillFrame = await path.getAttribute("stroke-dashoffset");
  await page.waitForTimeout(300);
  expect(await opacity()).toBe("0.4");
  expect(await path.getAttribute("stroke-dashoffset")).toBe(stillFrame);
  await page.reload();
  await expect.poll(opacity).toBe("0.4");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(opacity).not.toBe("0.4");
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(path).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe("UI audit regression", () => {
  test.use({ timezoneId: "Asia/Dhaka" });
  test("UI audit fixes preserve drafts, links, focus, and recovery", async ({ page, context }) => {
    test.setTimeout(120_000);
    page.on("dialog", (dialog) => dialog.accept());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const db = drizzle(pool, { schema });
    const staffId = staffCookie.split(":")[0];
    await context.addCookies([
      { name: "session", value: staffCookie, url: base },
      { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
    ]);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-20T19:00:00Z"));
    await page.goto(base + "/dashboard/applications/new");
    const localDate = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });
    expect(localDate).toBe("2026-10-21");
    await expect(page.getByLabel("Received date", { exact: true })).toHaveValue(localDate);
    await expect(page.locator("main")).toHaveCount(1);
    await page.getByRole("button", { name: "Create client file", exact: true }).click();
    await expect(page.getByLabel("Client name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Client name", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(7);
    await page.getByLabel("Client name", { exact: true }).fill("Preserved intake draft");
    // Navigate through the application's own links, then use browser Back.
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    await page
      .locator('a[data-sidebar="menu-button"][href="/dashboard/applications"]')
      .last()
      .click();
    await page.waitForURL(base + "/dashboard/applications");
    await page.goBack();
    await expect(page.getByLabel("Client name", { exact: true })).toHaveValue(
      "Preserved intake draft",
    );
    await page.goto(base + "/dashboard/applications");
    for (const route of ["applications", "clients", "documents", "issues", "reports"]) {
      await page.goto(base + `/dashboard/${route}?page=999`);
      await expect(page).toHaveURL(base + `/dashboard/${route}`);
    }
    const [issue] = await db
      .insert(schema.reviewIssueTable)
      .values({
        applicationId,
        title: "Inspect this exact finding",
        description: "Confirm the identity.",
        severity: "high",
        source: "reviewer",
        status: "resolved",
      })
      .returning();
    await page.goto(base + "/dashboard/issues");
    await page.getByRole("link", { name: issue.title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`issue=${issue.id}`));
    await expect(page).toHaveURL(/status=all/);
    await expect(page.getByRole("region", { name: "Selected issue" })).toContainText(issue.title);
    let previewRequests = 0;
    await page.route("**/api/document-preview/**", async (route) => {
      previewRequests++;
      await route.fulfill({ status: 503, body: "Isolated preview failure" });
    });
    const document = await db.query.uploadedDocumentTable.findFirst({
      where: eq(schema.uploadedDocumentTable.applicationId, applicationId),
    });
    await page
      .getByRole("combobox", { name: "Select evidence document", exact: true })
      .selectOption(document!.id);
    await expect(page.getByRole("button", { name: "Retry preview", exact: true })).toBeVisible();
    const requestsBeforeRetry = previewRequests;
    await page.getByRole("button", { name: "Retry preview", exact: true }).click();
    await expect.poll(() => previewRequests).toBeGreaterThan(requestsBeforeRetry);
    await page.unrouteAll({ behavior: "wait" });
    const tab = page.getByRole("tab", { name: "Review", exact: true });
    await tab.focus();
    await tab.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Checklist", exact: true })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Checklist", exact: true })).toHaveCSS(
      "outline-style",
      "solid",
    );
    await page.getByRole("tab", { name: "Review", exact: true }).click();
    await page.getByRole("button", { name: "Add issue", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Severity", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Severity", exact: true })).toHaveCSS(
      "border-radius",
      "5px",
    );
    await page.getByLabel("Reviewer issue", { exact: true }).click();
    await expect(page.getByLabel("Reviewer issue", { exact: true })).toBeFocused();
    await page.goto(base + "/dashboard/clients");
    const application = await db.query.visaApplicationTable.findFirst({
      where: eq(schema.visaApplicationTable.id, applicationId),
    });
    const client = await db.query.agencyClientTable.findFirst({
      where: eq(schema.agencyClientTable.id, application!.clientId!),
    });
    await page.getByRole("link", { name: client!.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`client=${client!.id}`));
    await expect(page.getByText("Showing cases for the selected client.")).toBeVisible();
    await page.goto(base + "/dashboard/team");
    await expect(page.getByRole("link", { name: "Invite staff", exact: true })).toHaveAttribute(
      "href",
      "/dashboard/agency#invitations",
    );
    await expect(page.getByRole("combobox", { name: "Staff role", exact: true })).toHaveCSS(
      "border-radius",
      "5px",
    );
    const [member] = await db
      .insert(schema.agencyTeamMemberTable)
      .values({
        agencyId,
        email: "another-reviewer@example.test",
        role: "member",
        status: "active",
      })
      .returning();
    await page.reload();
    await page
      .getByRole("row")
      .filter({ hasText: "another-reviewer@example.test" })
      .getByRole("button", { name: "Disable", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Disable staff access?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (
        await db.query.agencyTeamMemberTable.findFirst({
          where: eq(schema.agencyTeamMemberTable.id, member.id),
        })
      )?.status,
    ).toBe("active");
    // The save action stays pending until this private response is released.
    await page.goto(base + "/settings");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saveRequests = 0;
    await page.route(base + "/settings", async (route) => {
      if (route.request().method() === "POST") {
        saveRequests++;
        await held;
        await route.fulfill({ status: 500, body: "Isolated rejection" });
      } else await route.continue();
    });
    await page.getByRole("textbox", { name: "First Name", exact: true }).fill("Unsaved profile");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => saveRequests).toBe(1);
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(
      page.getByText("Could not save your profile. Try again.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "First Name", exact: true })).toHaveValue(
      "Unsaved profile",
    );
    const longEmail = `reviewer.${"a".repeat(52)}@${"b".repeat(60)}.example.test`;
    await db
      .update(schema.visaApplicationTable)
      .set({ clientEmail: longEmail, clientReportStatus: "ready" })
      .where(eq(schema.visaApplicationTable.id, applicationId));
    await db
      .update(schema.documentEvaluationTable)
      .set({ reviewStatus: "complete" })
      .where(eq(schema.documentEvaluationTable.applicationId, applicationId));
    const [report] = await db
      .insert(schema.clientReportTable)
      .values({ applicationId, status: "ready", summary: "Correct the scan.", actionItems: [] })
      .returning();
    const output = resolve("output/verification/ui-audit-fixes");
    mkdirSync(output, { recursive: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + `/dashboard/reports/${report.id}`);
      await expect(page.getByRole("button", { name: "Toggle Sidebar", exact: true })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      const send = page.getByRole("button", { name: `Send report to ${longEmail}`, exact: true });
      await expect(send).toBeVisible();
      const bounds = await send.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await send.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      );
      await page.screenshot({ path: join(output, `report-${width}.png`), fullPage: true });
    }
    await db
      .update(schema.visaApplicationTable)
      .set({ clientReportStatus: "draft" })
      .where(eq(schema.visaApplicationTable.id, applicationId));
    await page.reload();
    await expect(page.locator("article header")).toContainText("Out of date");
    const [ticket] = await db
      .insert(schema.supportTicketTable)
      .values({
        userId: staffId,
        subject: "Preserve support context",
        description: "Check this support conversation.",
        category: "bug",
      })
      .returning();
    await page.goto(base + `/dashboard/support?ticket=${ticket.id}&view=ticket`);
    await expect(page.getByRole("heading", { name: ticket.subject, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: ticket.subject, exact: true })).toBeVisible();
    await page.goto(base + "/dashboard/announcements?type=maintenance&q=planned");
    await expect(
      page.getByRole("textbox", { name: "Search announcements", exact: true }),
    ).toHaveValue("planned");
    await expect(page.getByRole("combobox", { name: "Announcement type", exact: true })).toHaveText(
      "Maintenance",
    );
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Search announcements", exact: true }),
    ).toHaveValue("planned");
    await context.clearCookies();
    await page.goto(base + "/sign-in");
    const password = await page
      .getByRole("button", { name: "Show password", exact: true })
      .boundingBox();
    expect(password!.width).toBeGreaterThanOrEqual(36);
    expect(password!.height).toBeGreaterThanOrEqual(36);
    await page.goto(base + "/");
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Mobile primary", exact: true })
      .getByRole("link", { name: "About", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/about");
    expect(
      await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Mobile primary", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Mobile primary", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: join(output, "public-navigation-320.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByText("All systems operational", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("route details preserve drafts, cover all applicants, and require a current review", async ({
  page,
  context,
}) => {
  const db = drizzle(pool, { schema });
  const original = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, applicationId),
  });
  if (!original) throw new Error("Missing isolated case");
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: original.userId,
      agencyId,
      clientId: original.clientId,
      clientName: "Route test family",
      homeCountry: "Bangladesh",
      currentCountry: "Canada",
      destinationCountry: "Canada",
      visaType: "Express Entry",
      embassy: "IRCC",
      settings: JSON.stringify({ preserveMe: "existing value" }),
    })
    .returning();
  const people = await db
    .insert(schema.applicantTable)
    .values([
      { applicationId: application.id, name: "Route parent", relationship: "primary" },
      { applicationId: application.id, name: "Route child", relationship: "child" },
    ])
    .returning();
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/dashboard/${application.id}?tab=notes`);
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "Supporting evidence" })).toHaveCount(0);
  const guidance = page.locator('details[aria-label="Route guidance and official sources"]');
  await expect(guidance).not.toHaveAttribute("open");
  await guidance.locator("summary").focus();
  await guidance.locator("summary").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Route requirements", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Case details for this route", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Checklist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Checklist sources", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Refresh checklist", exact: true })).toHaveCount(0);
  await expect(page.getByText("Required files uploaded", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Generate.*checklist/i }).first()).toBeVisible();
  // Store the first generated rows without calling a live model in this browser test.
  await db.insert(schema.checklistItemTable).values(
    people.map((person) => ({
      applicationId: application.id,
      applicantId: person.id,
      documentName: "Supporting evidence",
      description:
        "Draft — staff must confirm this document and its applicability. First checklist evidence",
      isRequired: false,
    })),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Checklist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Checklist sources", exact: true })).toBeVisible();
  await expect(page.getByText("0/2 checklist items have files.", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^First checklist evidence$/ })).toHaveCount(2);
  await expect(
    page.getByText(/Draft — staff must confirm|requirement not confirmed|0\/0 required documents/),
  ).toHaveCount(0);
  const checklistOutput = resolve("output/verification/checklist-wording");
  mkdirSync(checklistOutput, { recursive: true });
  await page.screenshot({ path: join(checklistOutput, "checklist.png"), animations: "disabled" });
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await guidance.locator("summary").click();
  await expect(
    page.getByRole("heading", { name: "Route requirements", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark ready to submit", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark ready to submit", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Readiness score", { exact: true })).toHaveCount(0);
  const reviews = page.getByRole("button", { name: "Upload usable documents", exact: true });
  await expect(reviews).toHaveCount(2);
  await expect(reviews.nth(0)).toBeDisabled();
  await expect(reviews.nth(1)).toBeDisabled();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByLabel("Process stage", { exact: true }).selectOption("application");
  await page.getByLabel("Exact category or legal basis", { exact: true }).fill("CEC");
  await page
    .getByLabel("Application date or planned filing date", { exact: true })
    .fill("2026-10-22");
  for (const person of people) {
    await page.locator(`#nationality-${person.id}`).fill("Bangladesh");
    await page
      .locator(`#dob-${person.id}`)
      .fill(person.relationship === "primary" ? "1990-01-01" : "2015-01-01");
  }
  await page.getByRole("button", { name: "Save case details", exact: true }).click();
  await expect(
    page.getByText("Case details saved. Run review again for the current details.", {
      exact: true,
    }),
  ).toBeVisible();
  const saved = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, application.id),
  });
  expect(JSON.parse(saved!.settings)).toMatchObject({
    preserveMe: "existing value",
    routeReview: { subtype: "CEC", stage: "application" },
  });
  expect(saved!.readinessScore).toBeNull();
  const savedPeople = await db.query.applicantTable.findMany({
    where: eq(schema.applicantTable.applicationId, application.id),
  });
  expect(savedPeople.every((person) => person.nationality === "Bangladesh")).toBe(true);
  await db
    .update(schema.applicantTable)
    .set({ name: "Updated elsewhere" })
    .where(eq(schema.applicantTable.id, people[1].id));
  await page.getByLabel("Exact category or legal basis", { exact: true }).fill("Unsaved FSW draft");
  await page.getByRole("button", { name: "Save case details", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "case changed" })).toBeVisible();
  await expect(page.getByLabel("Exact category or legal basis", { exact: true })).toHaveValue(
    "Unsaved FSW draft",
  );
  expect(
    JSON.parse(
      (await db.query.visaApplicationTable.findFirst({
        where: eq(schema.visaApplicationTable.id, application.id),
      }))!.settings,
    ).routeReview.subtype,
  ).toBe("CEC");
  await page.getByRole("button", { name: "Load saved details", exact: true }).click();
  await expect(page.getByLabel("Exact category or legal basis", { exact: true })).toHaveValue(
    "CEC",
  );
  await page.getByLabel("Exact category or legal basis", { exact: true }).fill("FSW");
  await page.getByRole("button", { name: "Save case details", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await db.query.visaApplicationTable.findFirst({
            where: eq(schema.visaApplicationTable.id, application.id),
          }))!.settings,
        ).routeReview.subtype,
    )
    .toBe("FSW");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Save case details", exact: true })
    .scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const output = resolve("output/verification/dynamic-rubric");
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, "route-details-390.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("expert-approved guidance allows a complete current case to be marked ready", async ({
  page,
  context,
}) => {
  const db = drizzle(pool, { schema });
  const original = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, applicationId),
  });
  const sourceDocument = await db.query.uploadedDocumentTable.findFirst();
  if (!original || !sourceDocument) throw new Error("Missing isolated fixture");
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: original.userId,
      agencyId,
      clientId: original.clientId,
      clientName: "Approved route client",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Short-Stay Tourist",
      embassy: "Dhaka",
      agencyStatus: "in_review",
    })
    .returning();
  const [person] = await db
    .insert(schema.applicantTable)
    .values({
      applicationId: application.id,
      name: "Approved route applicant",
      relationship: "primary",
    })
    .returning();
  const [item] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId: application.id,
      applicantId: person.id,
      documentName: "Passport",
      description: "Passport evidence",
      isRequired: true,
    })
    .returning();
  const [document] = await db
    .insert(schema.uploadedDocumentTable)
    .values({
      applicationId: application.id,
      applicantId: person.id,
      checklistItemId: item.id,
      fileName: "approved-passport.pdf",
      fileKey: sourceDocument.fileKey,
      fileSize: sourceDocument.fileSize,
      mimeType: "application/pdf",
      extractionStatus: "completed",
      textContent: "Complete passport evidence",
    })
    .returning();
  await db.insert(schema.documentEvaluationTable).values({
    applicationId: application.id,
    applicantId: person.id,
    overallScore: 100,
    riskLevel: "low",
    reviewStatus: "complete",
    summary: "Required evidence reviewed",
    redFlags: [],
    strengths: [],
    recommendations: [],
    docSnapshots: { [item.id]: `${document.id}:1:0` },
    itemFeedback: {
      [item.id]: {
        status: "ok",
        hasDocument: true,
        hasContent: true,
        feedback: "Complete passport evidence",
        issues: [],
        score: 100,
      },
    },
  });
  await refreshCurrentReviewMetadata(application.id);
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.goto(`${base}/dashboard/${application.id}?tab=details`);
  await expect(page.getByText("Approved route guidance", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/requirements need approval|not yet have a complete approved rule set/),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  const finalize = page.getByRole("button", { name: "Mark ready to submit", exact: true });
  await expect(finalize).toBeEnabled();
  await finalize.click();
  await expect
    .poll(
      async () =>
        (
          await db.query.visaApplicationTable.findFirst({
            where: eq(schema.visaApplicationTable.id, application.id),
          })
        )?.agencyStatus,
    )
    .toBe("ready_to_submit");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Case status", exact: true })).toHaveText(
    "Ready to Submit",
  );
});

test("long visa labels stay inside the Case details form at desktop and mobile widths", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.goto(`${base}/dashboard/${applicationId}?tab=details`);
  await page.getByLabel("Destination", { exact: true }).selectOption("France");
  const visa = page.getByLabel("Visa route", { exact: true });
  const form = page.locator("form").filter({ has: visa });
  const output = resolve("output/verification/notes-layout");
  mkdirSync(output, { recursive: true });
  for (const route of ["National Study (Type D)", "National Work (Type D)"]) {
    await visa.selectOption(route);
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await visa.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await visa.focus();
      const bounds = await form.evaluate((element) => {
        const parent = element.getBoundingClientRect();
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          controlsFit: [...element.querySelectorAll("input, select")].every((control) => {
            const box = control.getBoundingClientRect();
            return box.left >= parent.left - 1 && box.right <= parent.right + 1;
          }),
        };
      });
      expect(bounds.controlsFit, `${route} at ${width}px`).toBe(true);
      expect(bounds.scrollWidth, `${route} form at ${width}px`).toBeLessThanOrEqual(
        bounds.clientWidth + 1,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (route === "National Study (Type D)" && [1440, 390].includes(width)) {
        await page.screenshot({ path: join(output, `notes-${width}.png`), animations: "disabled" });
      }
    }
  }
});

test("staff can manage a checklist and request documents before the first review", async ({
  page,
  context,
}) => {
  const db = drizzle(pool, { schema });
  const original = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, applicationId),
  });
  if (!original) throw new Error("Missing isolated fixture");
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: original.userId,
      agencyId,
      clientId: original.clientId,
      clientName: "Checklist workflow client",
      clientEmail: "client@example.test",
      homeCountry: "Egypt",
      currentCountry: "Egypt",
      destinationCountry: "United States",
      visaType: "B1/B2 Visitor",
      embassy: "Cairo",
      agencyStatus: "intake",
    })
    .returning();
  const [person] = await db
    .insert(schema.applicantTable)
    .values({ applicationId: application.id, name: "Checklist applicant", relationship: "primary" })
    .returning();
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  await page.goto(`${base}/dashboard/${application.id}?tab=checklist`);
  await expect(
    page.getByRole("button", { name: "Generate checklist first", exact: true }),
  ).toBeDisabled();
  await page.getByText("Add checklist item", { exact: true }).click();
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("textbox", { name: "Document name", exact: true }) });
  await addForm
    .getByRole("textbox", { name: "Document name", exact: true })
    .fill("Workflow passport");
  await addForm
    .getByRole("textbox", { name: "What to provide", exact: true })
    .fill("Provide a readable passport.");
  await addForm.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByText("Workflow passport", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  const reviewStatus = page.getByRole("status", { name: "Review status", exact: true });
  await expect(reviewStatus).toContainText("1 required file missing");
  const statusBounds = await reviewStatus.boundingBox();
  const reviewBounds = await page
    .getByRole("tabpanel", { name: "Review", exact: true })
    .boundingBox();
  expect(statusBounds!.x).toBe(reviewBounds!.x);
  expect(statusBounds!.width).toBe(reviewBounds!.width);
  await expect(page.getByRole("region", { name: "Review readiness", exact: true })).toContainText(
    "Upload usable evidence",
  );
  await reviewStatus.getByRole("button", { name: /Open checklist/ }).click();
  await expect(page.getByRole("tab", { name: "Checklist", exact: true })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(reviewStatus).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload usable documents", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Request documents", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports\//);
  await expect(
    page.getByRole("heading", { name: "Client document request", exact: true }),
  ).toBeVisible();
  expect(
    await db.query.documentEvaluationTable.findMany({
      where: eq(schema.documentEvaluationTable.applicationId, application.id),
    }),
  ).toHaveLength(0);
  expect(
    (
      await db.query.visaApplicationTable.findFirst({
        where: eq(schema.visaApplicationTable.id, application.id),
      })
    )?.agencyStatus,
  ).not.toBe("needs_client");
  const item = await db.query.checklistItemTable.findFirst({
    where: eq(schema.checklistItemTable.applicationId, application.id),
  });
  if (!item) throw new Error("Missing added item");
  const [file] = await db
    .insert(schema.uploadedDocumentTable)
    .values({
      applicationId: application.id,
      applicantId: person.id,
      checklistItemId: item.id,
      fileName: "saved-passport.txt",
      fileKey: "private-test-only/saved-passport",
      fileSize: 20,
      mimeType: "text/plain",
      textContent: "Synthetic readable passport",
      extractionStatus: "completed",
    })
    .returning();
  await page.goto(`${base}/dashboard/${application.id}?tab=checklist`);
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  const editForm = page
    .locator("form")
    .filter({ has: page.getByRole("textbox", { name: "Document name", exact: true }) })
    .last();
  await editForm
    .getByRole("textbox", { name: "Document name", exact: true })
    .fill("Updated workflow passport");
  await editForm.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByText("Updated workflow passport", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Edit checklist item", exact: true })
    .getByRole("button", { name: "Remove item", exact: true })
    .click();
  await expect(page.getByText("Updated workflow passport", { exact: true })).toHaveCount(0);
  expect(
    (
      await db.query.checklistItemTable.findFirst({
        where: eq(schema.checklistItemTable.id, item.id),
      })
    )?.removedAt,
  ).toBeTruthy();
  expect(
    await db.query.uploadedDocumentTable.findFirst({
      where: eq(schema.uploadedDocumentTable.id, file.id),
    }),
  ).toBeTruthy();
});

test("case tabs use visible sections and an issue dialog at desktop and phone widths", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const output = resolve("output/verification/case-redesign");
  mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/dashboard/${applicationId}?tab=review`);
    const workspace = page.getByLabel("Application review workspace", { exact: true });
    await expect(workspace.locator("footer")).toHaveCount(0);
    const actions = page.getByRole("group", { name: "Case actions", exact: true });
    await expect(actions.getByRole("button", { name: "Client report", exact: true })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Case sections", exact: true });
    const actionsBounds = await actions.boundingBox();
    const tabsBounds = await tabs.boundingBox();
    if (width >= 900) {
      expect(actionsBounds!.x).toBeGreaterThan(tabsBounds!.x);
      expect(Math.abs(actionsBounds!.y - tabsBounds!.y)).toBeLessThan(10);
    } else {
      expect(actionsBounds!.y).toBeGreaterThan(tabsBounds!.y);
    }
    const status = page.getByRole("status", { name: "Review status", exact: true });
    if (await status.count()) {
      const statusBounds = await status.boundingBox();
      const paneBounds = await page
        .getByRole("tabpanel", { name: "Review", exact: true })
        .boundingBox();
      expect(statusBounds!.x).toBe(paneBounds!.x);
      expect(statusBounds!.width).toBe(paneBounds!.width);
    }
    const add = page.getByRole("button", { name: "Add issue", exact: true });
    const heading = page.getByRole("heading", { name: "Review issues", exact: true });
    const titleBounds = await heading.boundingBox();
    const actionBounds = await add.boundingBox();
    expect(actionBounds!.x).toBeGreaterThan(titleBounds!.x);
    expect(Math.abs(actionBounds!.y - titleBounds!.y)).toBeLessThan(8);
    await add.click();
    const dialog = page.getByRole("dialog", { name: "Add issue", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Reviewer issue", { exact: true })).toBeFocused();
    await expect
      .poll(async () => {
        const position = await dialog.boundingBox();
        return Boolean(position && position.x >= 8 && position.x + position.width <= width - 8);
      })
      .toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 8);
    await page.screenshot({ path: join(output, `add-issue-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    for (const name of ["Review", "Checklist", "Details"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(workspace.locator("details")).toHaveCount(name === "Details" ? 1 : 0);
      await expect(page.getByRole("tab", { name: "Activity", exact: true })).toHaveCount(0);
      if (name === "Details")
        await expect(
          page.getByRole("heading", { name: "Case activity", exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: join(output, `${name.toLowerCase()}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  expect(errors).toEqual([]);
});

test("Details groups the form beside case records and activity and stacks on small screens", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/dashboard/${applicationId}?tab=details`);
  const panel = page.getByRole("tabpanel", { name: "Details", exact: true });
  const form = panel.getByRole("region", { name: "Case details for this route", exact: true });
  const sidebar = panel.getByRole("complementary", { name: "Case information", exact: true });
  const guidance = panel.locator('details[aria-label="Route guidance and official sources"]');
  await expect(form.getByRole("group", { name: "Visa route", exact: true })).toBeVisible();
  await expect(form.getByRole("group", { name: "Applicants", exact: true })).toBeVisible();
  await expect(
    sidebar.getByRole("region", { name: "Applicant records", exact: true }),
  ).toBeVisible();
  await expect(sidebar.getByRole("region", { name: "Case activity", exact: true })).toBeVisible();
  await expect(guidance).not.toHaveAttribute("open");
  await expect(
    panel.getByRole("heading", { name: "Route requirements", exact: true }),
  ).not.toBeVisible();
  await guidance.locator("summary").focus();
  await guidance.locator("summary").press("Space");
  await expect(guidance).toHaveAttribute("open", "");
  await expect(
    guidance.getByRole("heading", { name: "Route requirements", exact: true }),
  ).toBeVisible();
  await guidance.locator("summary").press("Space");
  await expect(guidance).not.toHaveAttribute("open");
  const output = resolve("output/verification/details-redesign");
  mkdirSync(output, { recursive: true });
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await form
      .getByRole("heading", { name: "Application details", exact: true })
      .scrollIntoViewIfNeeded();
    const formBounds = await form.boundingBox();
    const sidebarBounds = await sidebar.boundingBox();
    const guidanceBounds = await guidance.boundingBox();
    expect(formBounds).not.toBeNull();
    expect(sidebarBounds).not.toBeNull();
    expect(guidanceBounds).not.toBeNull();
    if (width >= 1200) {
      expect(sidebarBounds!.x).toBeGreaterThanOrEqual(formBounds!.x + formBounds!.width + 20);
      expect(Math.abs(sidebarBounds!.y - formBounds!.y)).toBeLessThan(2);
    } else {
      expect(sidebarBounds!.y).toBeGreaterThanOrEqual(
        guidanceBounds!.y + guidanceBounds!.height + 15,
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: join(output, `details-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const save = form.getByRole("button", { name: "Save case details", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await save.hover();
    await sidebar
      .getByRole("heading", { name: "Case activity", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(sidebar.getByText("Case created", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("checklist sources stay compact and show full evidence in a modal", async ({
  page,
  context,
}) => {
  const db = drizzle(pool, { schema });
  const original = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, applicationId),
  });
  if (!original) throw new Error("Missing isolated case");
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: original.userId,
      agencyId,
      clientId: original.clientId,
      clientName: "Sources client",
      homeCountry: "Austria",
      currentCountry: "Austria",
      destinationCountry: "France",
      visaType: "National Study (Type D)",
      embassy: "Vienna",
    })
    .returning();
  const [person] = await db
    .insert(schema.applicantTable)
    .values({ applicationId: application.id, name: "Sources applicant", relationship: "primary" })
    .returning();
  const [item] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId: application.id,
      applicantId: person.id,
      documentName: "Passport",
      description: "Provide a passport.",
      isRequired: false,
    })
    .returning();
  const titles = [
    "Visa requirement",
    "Admission letter",
    "Funding evidence",
    "Passport",
    "Personalized checklist",
  ];
  const candidates = titles.map((documentName, index) => ({
    checklistItemId: index === 3 ? item.id : `source-item-${index}`,
    documentName,
    description: "Saved document reference.",
    commonMistakes: "",
    requirement: "conditional",
    applicability: "unknown",
    condition: "If the visa route applies.",
    sources: [
      {
        url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2231",
        claim: `Saved source note for ${documentName}.`,
        quotation: "Saved supporting text from the reference.",
        scope: "Student applicants",
        effectiveDate: "2026-10-08",
      },
    ],
  }));
  await db
    .update(schema.visaApplicationTable)
    .set({
      settings: JSON.stringify({
        checklistResearch: {
          [person.id]: {
            status: "generated",
            contextHash: "0".repeat(64),
            sourceVersion: "saved-test-version",
            referenceDate: "2026-10-22",
            generatedAt: "2026-10-22T13:33:51.000Z",
            retrievedAt: "2026-10-22T13:33:44.000Z",
            source: "live_search",
            route: { destinationCountry: "France", visaType: "National Study (Type D)" },
            citations: ["https://www.service-public.gouv.fr/particuliers/vosdroits/F2231"],
            candidates,
            activeCandidateIds: candidates.map((candidate) => candidate.checklistItemId),
          },
        },
      }),
    })
    .where(eq(schema.visaApplicationTable.id, application.id));
  await context.addCookies([
    { name: "session", value: staffCookie, url: base },
    { name: "csrf-token", value: "isolated-browser-csrf-token", url: base },
  ]);
  const output = resolve("output/verification/checklist-sources");
  mkdirSync(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/dashboard/${application.id}?tab=checklist`);
    const summary = page.getByRole("region", { name: "Checklist sources", exact: true });
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toContainText("Checked Oct 22, 2026");
    await expect(summary).not.toContainText("Out of date");
    await expect(summary).not.toContainText("Saved source note");
    await expect(
      summary.getByRole("button", { name: "Refresh checklist", exact: true }),
    ).toBeEnabled();
    const viewSources = summary.getByRole("button", { name: "View sources", exact: true });
    await page.screenshot({ path: join(output, `summary-${width}.png`), animations: "disabled" });
    await viewSources.click();
    const dialog = page.getByRole("dialog", { name: "Checklist sources", exact: true });
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => {
        const rect = await dialog.boundingBox();
        return Boolean(
          rect &&
          rect.x >= 8 &&
          rect.x + rect.width <= width - 8 &&
          rect.y >= 8 &&
          rect.y + rect.height <= 900 - 8,
        );
      })
      .toBe(true);
    for (const title of titles)
      await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeAttached();
    await expect(
      dialog.getByText("Saved source note for Visa requirement.", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("link")).toHaveCount(5);
    await expect(dialog.locator("blockquote")).toHaveCount(5);
    const finalClaim = dialog.getByText("Saved source note for Personalized checklist.", {
      exact: true,
    });
    await finalClaim.scrollIntoViewIfNeeded();
    await expect(finalClaim).toBeInViewport();
    await dialog
      .getByRole("heading", { name: "Latest sources", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `sources-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(viewSources).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("checklist generation status survives navigation and reload and shows saved results", async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: "session", value: staffCookie, url: base }]);
  const db = drizzle(pool, { schema });
  const original = await db.query.visaApplicationTable.findFirst({
    where: eq(schema.visaApplicationTable.id, applicationId),
  });
  const staff = await db.query.agencyTeamMemberTable.findFirst({
    where: eq(schema.agencyTeamMemberTable.status, "active"),
  });
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: original!.userId,
      agencyId,
      clientId: original!.clientId,
      clientName: "Background checklist client",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
    })
    .returning();
  const [applicant] = await db
    .insert(schema.applicantTable)
    .values({
      applicationId: application.id,
      name: "Background checklist applicant",
      relationship: "primary",
    })
    .returning();
  const [job] = await db
    .insert(schema.checklistJobTable)
    .values({
      applicationId: application.id,
      applicantId: applicant.id,
      userId: staff!.userId!,
      contextHash: "a".repeat(64),
      status: "queued",
    })
    .returning();
  try {
    await page.goto(`${base}/dashboard/${application.id}?tab=checklist`);
    await expect(
      page.getByRole("button", { name: "Checklist queued", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Checklist queued", exact: true }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await page.getByRole("tab", { name: "Checklist", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Checklist queued", exact: true }),
    ).toBeDisabled();
    await db
      .update(schema.checklistJobTable)
      .set({ status: "running" })
      .where(eq(schema.checklistJobTable.id, job.id));
    await expect(
      page.getByRole("button", { name: "Generating checklist...", exact: true }),
    ).toBeDisabled();
    await db.insert(schema.checklistItemTable).values({
      applicationId: application.id,
      applicantId: applicant.id,
      documentName: "Generated passport",
      description: "Provide a readable passport.",
      isRequired: true,
    });
    await db
      .update(schema.checklistJobTable)
      .set({ status: "succeeded" })
      .where(eq(schema.checklistJobTable.id, job.id));
    await expect(page.getByText("Generated passport", { exact: true })).toBeVisible();
    const [refreshJob] = await db
      .insert(schema.checklistJobTable)
      .values({
        applicationId: application.id,
        applicantId: applicant.id,
        userId: staff!.userId!,
        contextHash: "b".repeat(64),
        refreshResearch: true,
        status: "queued",
      })
      .returning();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Checklist queued", exact: true }),
    ).toBeDisabled();
    await db
      .update(schema.checklistJobTable)
      .set({ status: "failed", error: "Checklist generation failed. Please try again." })
      .where(eq(schema.checklistJobTable.id, refreshJob.id));
    await expect(
      page.getByRole("alert").filter({ hasText: "Checklist generation failed. Please try again." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh checklist", exact: true }),
    ).toBeEnabled();
  } finally {
    await db
      .delete(schema.visaApplicationTable)
      .where(eq(schema.visaApplicationTable.id, application.id));
  }
});
