import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
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
let mailLog: string;
let control: string;
let serverLog: string;

interface CapturedMail {
  body: { to: string[]; text: string; subject: string; tags?: { name: string; value: string }[] };
  key: string | null;
  accepted: boolean;
}

function messages(): CapturedMail[] {
  return readFileSync(mailLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

async function screenshot({ page, info, name }: { page: Page; info: TestInfo; name: string }) {
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

async function prepareContext(context: BrowserContext) {
  await context.addCookies([{ name: "csrf-token", value: "isolated-membership-csrf", url: base }]);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.protocol === "data:" || url.protocol === "blob:")
      await route.continue();
    else await route.abort();
  });
}

async function signupAndVerify({
  page,
  email,
  name,
  redirectPath = "/dashboard",
}: {
  page: Page;
  email: string;
  name: string;
  redirectPath?: string;
}) {
  await page.goto(`${base}/sign-up?redirect=${encodeURIComponent(redirectPath)}`);
  await page.getByRole("button", { name: "Continue with email", exact: true }).click();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Full Name", exact: true }).fill(name);
  await page.getByLabel("Create Password", { exact: true }).fill("Membership-test-123!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/pending-verification/);
  await expect(page.getByRole("heading", { name: "Verify your email", exact: true })).toBeVisible();
  const user = (
    await pool.query('SELECT id, "emailVerified", role FROM "user" WHERE email = $1', [email])
  ).rows[0];
  expect(user.emailVerified).toBeNull();
  expect(user.role).toBe("user");
  expect(
    (await pool.query('SELECT id FROM agency_team_member WHERE "userId" = $1', [user.id])).rowCount,
  ).toBe(0);
  await expect
    .poll(
      () =>
        messages().filter(
          (mail) => mail.body.to.includes(email) && mail.body.text.includes("/verify-email?token="),
        ).length,
    )
    .toBe(1);
  const mail = messages().find(
    (mail) => mail.body.to.includes(email) && mail.body.text.includes("/verify-email?token="),
  )!;
  const link = mail.body.text.match(/https?:\/\/[^\s]+\/verify-email\?token=[^\s]+/)?.[0];
  if (!link) throw new Error("Verification email did not include a link");
  // Keep the real token and path but use the private preview origin.
  const url = new URL(link);
  await page.goto(base + url.pathname + url.search);
  await expect(
    page.getByRole("heading", { name: "Set up your agency", exact: true }),
  ).toBeVisible();
  expect(
    (await pool.query('SELECT "emailVerified" FROM "user" WHERE id = $1', [user.id])).rows[0]
      .emailVerified,
  ).not.toBeNull();
  return user.id as string;
}

async function seedVerifiedUser(context: BrowserContext) {
  const db = drizzle(pool, { schema });
  const [user] = await db
    .insert(schema.userTable)
    .values({
      email: "outsider@membership.test",
      firstName: "Separate",
      lastName: "Owner",
      emailVerified: new Date(),
    })
    .returning();
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
  await context.addCookies([{ name: "session", value: `${user.id}:${token}`, url: base }]);
  return user.id;
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
  directory = mkdtempSync("/tmp/vidicy-membership-browser-");
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
  redis = createClient({ socket: { path: socket, reconnectStrategy: false } });
  await redis.connect();
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
  const body = JSON.parse(init.body);
  const accepted = readFileSync(${JSON.stringify(control)}, 'utf8') !== 'reject';
  appendFileSync(${JSON.stringify(mailLog)}, JSON.stringify({body, key:new Headers(init.headers).get('Idempotency-Key'), accepted})+'\\n');
  return accepted ? Response.json({id:'test-message-accepted'}) : Response.json({error:'isolated test rejection'}, {status:503});
 }
 if (url.hostname === 'disposable.debounce.io') return Response.json({disposable:'false'});
 if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return realFetch(input, init);
 throw new Error('External access disabled in isolated membership browser fixture');
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
    EMAIL_FROM: "invites@membership.test",
    EMAIL_FROM_NAME: "Membership Test",
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
    await info.attach("isolated-membership-server-log", {
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

test("agency setup offers sign-out beside Home and preserves drafts on failure", async ({
  browser,
}, info) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await prepareContext(context);
      const userId = await seedVerifiedUser(context, `setup-signout-${width}@membership.test`);
      const page = await context.newPage();
      const setupPath = width === 390 ? "/agency-setup?code=Draft-invite-code" : "/agency-setup";
      await page.goto(base + setupPath);
      const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
      await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
      const signOut = navigation.getByRole("button", { name: "Sign out", exact: true });
      await expect(signOut).toBeVisible();
      const draft = page.getByRole("textbox", {
        name: width === 390 ? "Invite code" : "Agency name",
        exact: true,
      });
      const value = width === 390 ? "Draft-invite-code" : "Agency draft to preserve";
      await draft.fill(value);
      await screenshot({ page, info, name: `setup-signout-${width}` });
      const cookie = (await context.cookies()).find((item) => item.name === "session")!;
      const token = cookie.value.slice(cookie.value.indexOf(":") + 1);
      const sessionId = createHash("sha256").update(token).digest("hex");
      const sessionKey = `vidicy:cache:session:${userId}:${sessionId}`;
      expect(await redis.get(sessionKey)).not.toBeNull();

      // A failed security check must keep the session and the form draft.
      await context.addCookies([{ name: "csrf-token", value: "different-token", url: base }]);
      await signOut.click();
      await expect(page.getByText("Invalid request", { exact: true })).toBeVisible();
      await expect(signOut).toBeEnabled();
      await expect(draft).toHaveValue(value);
      expect(new URL(page.url()).pathname).toBe("/agency-setup");
      expect(await redis.get(sessionKey)).not.toBeNull();
      await context.addCookies([
        { name: "csrf-token", value: "isolated-membership-csrf", url: base },
      ]);

      let release!: () => void;
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/agency-setup*", async (route) => {
        if (route.request().method() === "POST" && route.request().headers()["next-action"])
          await paused;
        await route.continue();
      });
      try {
        await signOut.click();
        const pending = navigation.getByRole("button", { name: "Signing out…", exact: true });
        await expect(pending).toBeDisabled();
        await expect(pending).toHaveAttribute("aria-busy", "true");
      } finally {
        release();
      }
      await expect(page).toHaveURL(base + "/sign-in");
      expect(await redis.get(sessionKey)).toBeNull();
      expect((await context.cookies()).some((item) => item.name === "session")).toBe(false);
      expect(
        (await pool.query('SELECT id FROM agency_team_member WHERE "userId" = $1', [userId]))
          .rowCount,
      ).toBe(0);
      await page.goto(base + "/agency-setup");
      await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fagency-setup$/);
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test("sidebar shows the current agency above the account on desktop and mobile", async ({
  browser,
}, info) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await prepareContext(context);
    await seedVerifiedUser(context, "sidebar-identity@membership.test");
    const page = await context.newPage();
    await page.goto(`${base}/agency-setup`);
    await page
      .getByRole("textbox", { name: "Agency name", exact: true })
      .fill("Settings Paths Agency");
    await page.getByRole("button", { name: "Create agency", exact: true }).click();
    await expect(page).toHaveURL(`${base}/dashboard`);
    const identity = page.getByRole("region", { name: "Current agency", exact: true });
    await expect(identity).toContainText("Settings Paths Agency");
    await expect(identity).toHaveCSS("border-bottom-width", "0px");
    const agencyButton = identity.getByRole("link", { name: "Agency", exact: true });
    await expect(agencyButton).toHaveAttribute("href", "/dashboard/agency");
    await expect(page.getByRole("link", { name: "Agency", exact: true })).toHaveCount(1);
    const identityBounds = await identity.boundingBox();
    const account = page.locator('[data-sidebar="footer"] [data-sidebar="menu-button"]');
    await expect(account).not.toContainText("Settings Paths Agency");
    const accountBounds = await account.boundingBox();
    expect(identityBounds!.y + identityBounds!.height).toBeLessThanOrEqual(accountBounds!.y);
    await screenshot({ page, info, name: "sidebar-agency-desktop" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    const mobileSidebar = page.getByRole("dialog");
    const mobileIdentity = mobileSidebar.getByRole("region", {
      name: "Current agency",
      exact: true,
    });
    await expect(mobileIdentity).toContainText("Settings Paths Agency");
    await expect(mobileIdentity).toBeInViewport();
    await screenshot({ page, info, name: "sidebar-agency-mobile" });
    await mobileIdentity.getByRole("link", { name: "Agency", exact: true }).click();
    await expect(page).toHaveURL(`${base}/dashboard/agency`);
    await expect(mobileSidebar).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
  } finally {
    await context.close();
  }
});

test("signup, invitation delivery recovery, member access, agency isolation, ownership, and leave", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const outsiderContext = await browser.newContext();
  try {
    await Promise.all([
      prepareContext(ownerContext),
      prepareContext(memberContext),
      prepareContext(outsiderContext),
    ]);
    const owner = await ownerContext.newPage();
    const member = await memberContext.newPage();
    const outsider = await outsiderContext.newPage();
    const ownerId = await signupAndVerify({
      page: owner,
      email: "owner@membership.test",
      name: "Agency Owner",
    });
    await screenshot({ page: owner, info, name: "verified-create-or-join-desktop" });
    await owner.getByRole("textbox", { name: "Agency name", exact: true }).fill("North Agency");
    await owner.getByRole("button", { name: "Create agency", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              'SELECT count(*)::integer AS total FROM agency_team_member WHERE "userId" = $1',
              [ownerId],
            )
          ).rows[0].total,
      )
      .toBe(1);
    await expect(owner).toHaveURL(`${base}/dashboard`);
    const agency = (
      await pool.query(
        'SELECT a.id, a."ownerUserId", m.role, u.role AS "platformRole" FROM agency a JOIN agency_team_member m ON m."agencyId" = a.id JOIN "user" u ON u.id = m."userId" WHERE m."userId" = $1',
        [ownerId],
      )
    ).rows[0];
    expect(agency.ownerUserId).toBe(ownerId);
    expect(agency.role).toBe("admin");
    expect(agency.platformRole).toBe("user");
    await owner.goto(`${base}/settings/agency`);
    await expect(owner).toHaveURL(`${base}/dashboard/agency`);
    await expect(owner.getByRole("heading", { name: "Agency", exact: true })).toBeVisible();
    await expect(owner.getByRole("tablist")).toHaveCount(0);
    const agencyLink = owner.getByRole("link", { name: "Agency", exact: true }).first();
    await expect(agencyLink).toHaveAttribute("aria-current", "page");
    await expect(agencyLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await agencyLink.hover();
    await expect(agencyLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await owner.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(owner).toHaveURL(`${base}/settings`);
    await expect(owner.getByRole("tab")).toHaveText(["Profile", "Security", "Sessions"]);
    await owner.getByRole("link", { name: "Agency", exact: true }).click();
    await expect(owner).toHaveURL(`${base}/dashboard/agency`);
    await owner
      .getByRole("textbox", { name: "Agency name", exact: true })
      .fill("North Agency Updated");
    await owner.getByRole("button", { name: "Save agency name", exact: true }).click();
    await expect(owner.getByText("Agency name saved.", { exact: true })).toBeVisible();
    await expect(owner.getByRole("region", { name: "Current agency", exact: true })).toContainText(
      "North Agency Updated",
    );
    await expect(
      owner
        .getByText("Invite codes expire after 7 days and can be used once.", { exact: false })
        .first(),
    ).toBeVisible();
    // The real server persists a failed delivery after bounded provider attempts.
    await owner
      .getByRole("textbox", { name: "Email address (optional)", exact: true })
      .fill("member@membership.test");
    writeFileSync(control, "reject");
    await owner.getByRole("button", { name: "Create invitation", exact: true }).click();
    const codeInput = owner.getByRole("textbox", { name: "New invite code", exact: true });
    await expect(codeInput).toBeVisible();
    const code = await codeInput.inputValue();
    await expect(owner.getByText("Email delivery failed", { exact: true })).toBeVisible();
    await expect(
      owner.getByRole("button", { name: "Wait two minutes before resending", exact: true }),
    ).toBeDisabled();
    let invitation = (
      await pool.query('SELECT * FROM agency_invitation WHERE "recipientEmail" = $1', [
        "member@membership.test",
      ])
    ).rows[0];
    expect(invitation.deliveryStatus).toBe("failed");
    expect(invitation.deliveryAttempts).toBe(3);
    expect(invitation.sentAt).toBeNull();
    expect(invitation.expiresAt.getTime() - invitation.createdAt.getTime()).toBeGreaterThan(
      6.99 * 86400000,
    );
    expect(invitation.codeHash).not.toContain(code);
    // Move only the private fixture clock record past the cooldown.
    await pool.query(
      "UPDATE agency_invitation SET \"updatedAt\" = NOW() - INTERVAL '3 minutes' WHERE id = $1",
      [invitation.id],
    );
    writeFileSync(control, "accept");
    await owner.reload();
    await owner.getByRole("button", { name: "Retry email", exact: true }).click();
    await expect(owner.getByText("Email sent", { exact: true })).toBeVisible();
    invitation = (
      await pool.query("SELECT * FROM agency_invitation WHERE id = $1", [invitation.id])
    ).rows[0];
    expect(invitation.deliveryStatus).toBe("sent");
    expect(invitation.sentAt).not.toBeNull();
    const deliveries = messages().filter((mail) => mail.body.to.includes("member@membership.test"));
    expect(deliveries).toHaveLength(4);
    expect(new Set(deliveries.map((mail) => mail.key)).size).toBe(1);
    expect(deliveries[3].body.text).toContain(code);
    expect(deliveries[3].body.text).toContain("7 days");
    await owner.getByRole("button", { name: "Create invitation", exact: true }).click();
    await expect(codeInput).toBeVisible();
    const cancelledCode = await codeInput.inputValue();
    expect(cancelledCode).not.toBe(code);
    const genericInvitation = owner
      .getByRole("list", { name: "Agency invitations", exact: true })
      .locator("li")
      .filter({ has: owner.getByText("Invite code", { exact: true }) });
    await genericInvitation.getByRole("button", { name: "Cancel invitation", exact: true }).click();
    await expect(genericInvitation.getByText("Cancelled", { exact: true })).toBeVisible();
    await owner.getByRole("button", { name: "Create invitation", exact: true }).click();
    await expect(codeInput).toBeVisible();
    await expect(codeInput).not.toHaveValue(cancelledCode);
    const singleUseCode = await codeInput.inputValue();
    expect(singleUseCode).not.toBe(cancelledCode);
    await owner.getByRole("heading", { name: "Agency", exact: true }).scrollIntoViewIfNeeded();
    await screenshot({ page: owner, info, name: "owner-settings-desktop" });
    await owner.getByText("Invite staff", { exact: true }).scrollIntoViewIfNeeded();
    await screenshot({ page: owner, info, name: "owner-invitations-desktop" });
    const memberId = await signupAndVerify({
      page: member,
      email: "member@membership.test",
      name: "Agency Member",
      redirectPath: `/agency-setup?code=${encodeURIComponent(code)}`,
    });
    await expect(member.getByRole("tab", { name: "Join agency", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(member.getByRole("textbox", { name: "Invite code", exact: true })).toHaveValue(
      code,
    );
    await member.getByRole("button", { name: "Check invite code", exact: true }).click();
    await expect(
      member.getByRole("heading", { name: "North Agency Updated", exact: true }),
    ).toBeVisible();
    expect(
      (await pool.query('SELECT id FROM agency_team_member WHERE "userId" = $1', [memberId]))
        .rowCount,
    ).toBe(0);
    await screenshot({ page: member, info, name: "join-confirmation-mobile" });
    await member.getByRole("button", { name: "Join this agency", exact: true }).click();
    await expect(member).toHaveURL(`${base}/dashboard`);
    expect(
      (
        await pool.query('SELECT "agencyId", role FROM agency_team_member WHERE "userId" = $1', [
          memberId,
        ])
      ).rows,
    ).toEqual([{ agencyId: agency.id, role: "member" }]);
    await member.goto(`${base}/dashboard/agency`);
    await expect(
      member.getByText("Only agency admins can change these details.", { exact: true }),
    ).toBeVisible();
    await expect(member.getByRole("button", { name: "Save agency name", exact: true })).toHaveCount(
      0,
    );
    await expect(
      member.getByRole("button", { name: "Create invitation", exact: true }),
    ).toHaveCount(0);
    await member.getByRole("heading", { name: "Agency", exact: true }).scrollIntoViewIfNeeded();
    await screenshot({ page: member, info, name: "member-readonly-settings-mobile" });
    // A third user cannot reuse the consumed single-use invitation.
    const outsiderId = await seedVerifiedUser(outsiderContext);
    await outsider.goto(`${base}/agency-setup?code=${encodeURIComponent(cancelledCode)}`);
    await outsider.getByRole("button", { name: "Check invite code", exact: true }).click();
    await expect(outsider.getByRole("alert").filter({ hasText: "invite code" })).toContainText(
      "cancelled",
    );
    await expect(
      outsider.getByRole("button", { name: "Join this agency", exact: true }),
    ).toHaveCount(0);
    await outsider.goto(`${base}/agency-setup?code=${encodeURIComponent(code)}`);
    await outsider.getByRole("button", { name: "Check invite code", exact: true }).click();
    await expect(outsider.getByRole("alert").filter({ hasText: "invite code" })).toContainText(
      "already used",
    );
    await expect(
      outsider.getByRole("button", { name: "Join this agency", exact: true }),
    ).toHaveCount(0);
    // A shareable code can be used by any verified user, but only once.
    await outsider.goto(`${base}/agency-setup?code=${encodeURIComponent(singleUseCode)}`);
    await outsider.getByRole("button", { name: "Check invite code", exact: true }).click();
    await expect(
      outsider.getByRole("heading", { name: "North Agency Updated", exact: true }),
    ).toBeVisible();
    await outsider.getByRole("button", { name: "Join this agency", exact: true }).click();
    await expect(outsider).toHaveURL(`${base}/dashboard`);
    await pool.query('UPDATE agency_team_member SET status = $1 WHERE "userId" = $2', [
      "disabled",
      outsiderId,
    ]);
    await outsider.goto(`${base}/dashboard`);
    await expect(
      outsider.getByRole("heading", { name: "Your agency access is disabled", exact: true }),
    ).toBeVisible();
    await expect(outsider.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(outsider.getByRole("tab", { name: "Create agency", exact: true })).toHaveCount(0);
    await screenshot({ page: outsider, info, name: "disabled-membership-recovery-desktop" });
    await outsider.getByRole("button", { name: "Leave agency", exact: true }).click();
    await outsider
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm leave", exact: true })
      .click();
    await expect(
      outsider.getByRole("heading", { name: "Set up your agency", exact: true }),
    ).toBeVisible();
    expect(
      (await pool.query('SELECT id FROM agency_team_member WHERE "userId" = $1', [outsiderId]))
        .rowCount,
    ).toBe(0);
    await outsider.goto(`${base}/agency-setup?code=${encodeURIComponent(singleUseCode)}`);
    await outsider.getByRole("button", { name: "Check invite code", exact: true }).click();
    await expect(outsider.getByRole("alert").filter({ hasText: "invite code" })).toContainText(
      "already used",
    );
    await expect(
      outsider.getByRole("button", { name: "Join this agency", exact: true }),
    ).toHaveCount(0);
    await outsider.getByRole("tab", { name: "Create agency", exact: true }).click();
    await outsider
      .getByRole("textbox", { name: "Agency name", exact: true })
      .fill("South Private Agency");
    await outsider.getByRole("button", { name: "Create agency", exact: true }).click();
    await expect(outsider).toHaveURL(`${base}/dashboard`);
    const otherAgencyId = (
      await pool.query('SELECT "agencyId" FROM agency_team_member WHERE "userId" = $1', [
        outsiderId,
      ])
    ).rows[0].agencyId;
    expect(otherAgencyId).not.toBe(agency.id);
    const db = drizzle(pool, { schema });
    const [client] = await db
      .insert(schema.agencyClientTable)
      .values({ agencyId: agency.id, name: "North Confidential Client" })
      .returning();
    const [caseRow] = await db
      .insert(schema.visaApplicationTable)
      .values({
        agencyId: agency.id,
        userId: ownerId,
        clientId: client.id,
        clientName: client.name,
        assignedReviewerId: ownerId,
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        destinationCountry: "Japan",
        visaType: "Tourist",
        embassy: "Dhaka",
      })
      .returning();
    await outsider.goto(`${base}/dashboard/clients`);
    await expect(outsider.getByText(client.name, { exact: true })).toHaveCount(0);
    await outsider.goto(`${base}/dashboard/${caseRow.id}`);
    await expect(outsider.getByText("North Confidential Client", { exact: true })).toHaveCount(0);
    await expect(
      outsider.getByRole("heading", { name: "We couldn't find that page", exact: true }),
    ).toBeVisible();
    await outsider.goto(`${base}/dashboard/agency`);
    await expect(outsider.getByRole("textbox", { name: "Agency name", exact: true })).toHaveValue(
      "South Private Agency",
    );
    await expect(outsider.getByText("member@membership.test", { exact: true })).toHaveCount(0);
    // The owner must transfer ownership before the normal leave control is available.
    await owner.goto(`${base}/dashboard/agency`);
    await expect(owner.getByRole("button", { name: "Leave agency", exact: true })).toHaveCount(0);
    await owner.getByRole("combobox", { name: "New owner", exact: true }).click();
    await owner.getByRole("option", { name: "Agency Member", exact: true }).click();
    await owner.getByRole("button", { name: "Transfer ownership", exact: true }).click();
    await owner.getByRole("button", { name: "Confirm transfer", exact: true }).click();
    await expect(owner.getByRole("button", { name: "Leave agency", exact: true })).toBeVisible();
    expect(
      (await pool.query('SELECT "ownerUserId" FROM agency WHERE id = $1', [agency.id])).rows[0]
        .ownerUserId,
    ).toBe(memberId);
    await owner.getByRole("button", { name: "Leave agency", exact: true }).click();
    await owner
      .getByRole("dialog")
      .getByRole("button", { name: "Leave agency", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: "Set up your agency", exact: true }),
    ).toBeVisible();
    expect(
      (await pool.query('SELECT id FROM agency_team_member WHERE "userId" = $1', [ownerId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT "assignedReviewerId", "agencyId" FROM visa_application WHERE id = $1',
          [caseRow.id],
        )
      ).rows[0],
    ).toEqual({ assignedReviewerId: memberId, agencyId: agency.id });
    await owner.goto(`${base}/dashboard/${caseRow.id}`);
    await expect(owner).toHaveURL(/\/agency-setup/);
    await member.reload();
    await expect(member.getByText("You own this agency.", { exact: true })).toBeVisible();
    await member.setViewportSize({ width: 1440, height: 1000 });
    await member.getByRole("heading", { name: "Agency", exact: true }).scrollIntoViewIfNeeded();
    await screenshot({ page: member, info, name: "new-owner-settings-desktop" });
  } finally {
    await Promise.all([ownerContext.close(), memberContext.close(), outsiderContext.close()]);
  }
});
