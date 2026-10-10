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
let mailLog: string;
let control: string;
let serverLog: string;

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
  await expect(page.getByRole("heading", { name: "Alex Morgan", exact: true })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "Finalize review", exact: true })).toBeDisabled();
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
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add issue", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByText("Case created", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter issue status" }).selectOption("open");
  await page
    .getByRole("button", { name: "Review issue: Health insurance missing", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`issue=${missingIssue.id}`));
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Needs attention", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width < 900) {
      const detail = await page.getByRole("region", { name: "Selected issue" }).boundingBox();
      const evidence = await page
        .getByRole("region", { name: "Supporting evidence" })
        .boundingBox();
      expect(detail).not.toBeNull();
      expect(evidence).not.toBeNull();
      expect(evidence!.y).toBeGreaterThanOrEqual(detail!.y + detail!.height);
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
  expect(errors).toEqual([]);
});

test("long review findings can scroll above the bottom bar", async ({ page, context }) => {
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
    const panel = page.getByRole("tabpanel", { name: "Review", exact: true });
    const detail = page.getByRole("region", { name: "Selected issue" });
    const dismiss = detail.getByRole("button", { name: "Dismiss issue", exact: true });
    await expect(panel).toHaveCSS("scrollbar-width", "none");
    await expect(detail.getByRole("heading", { name: title, exact: true })).toBeAttached();
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
    await expect(
      detail.getByText("Upload all supporting evidence before submission.", {
        exact: false,
      }),
    ).toBeInViewport();
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
  const fixtureRows = await db
    .insert(schema.visaApplicationTable)
    .values(
      Array.from({ length: 9 }, (_, index) => ({
        userId: staffId,
        clientId: `dashboard-client-${index}`,
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
  await expect(row.getByRole("link", { name: "Add missing files", exact: true })).toHaveAttribute(
    "href",
    `/dashboard/${fixtureRows[0].id}?tab=checklist`,
  );
  await row.getByRole("link", { name: "Add missing files", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Checklist", exact: true })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByText("Funding evidence", { exact: true }).first()).toBeVisible();
  await page.goBack();
  await expect(queue).toContainText("QUEUE-0");
  await page.getByRole("button", { name: /marked-ready.*readiness check/ }).click();
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
  for (const width of [1586, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectDropdownSpacing({ page });
    if (width < 768) {
      const mobileQueue = page.getByRole("list", { name: "Client file work queue", exact: true });
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
    await page.getByRole("button", { name: "Add staff", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
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
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
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
