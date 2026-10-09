import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  requireAdmin: vi.fn(),
  head: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  put: vi.fn(),
  ticketFirst: vi.fn(),
  ticketMany: vi.fn(),
  messageMany: vi.fn(),
  messageFirst: vi.fn(),
  insert: vi.fn(),
  deleteRow: vi.fn(),
}));
vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mocks.session,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/utils/email", () => ({
  sendSupportTicketAdminNotification: vi.fn(),
  sendSupportTicketReplyNotification: vi.fn(),
  sendSupportTicketUserReplyNotification: vi.fn(),
}));
vi.mock("@/server/unread-counts", () => ({
  invalidateUnreadCount: vi.fn(),
  invalidateAdminUnreadCount: vi.fn(),
}));
vi.mock("@/infra/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      supportTicketTable: { findFirst: mocks.ticketFirst, findMany: mocks.ticketMany },
      supportMessageTable: { findFirst: mocks.messageFirst, findMany: mocks.messageMany },
    },
    insert: mocks.insert,
    delete: () => ({ where: mocks.deleteRow }),
  }),
}));
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: () => ({
    env: { R2: { head: mocks.head, get: mocks.get, delete: mocks.remove, put: mocks.put } },
  }),
}));
vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: async (action: () => Promise<unknown>) => action(),
}));
vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: async () => ({ session: await mocks.session() }),
}));

import { submitSupportTicket, addSupportMessage, deleteTicket } from "@/server/support";
import { POST as uploadScreenshot } from "@/app/api/upload-support-screenshot/route";
import { GET } from "@/app/api/support-screenshot/route";

const ownKey = "support-screenshots/user_1/own.png";
const adminKey = "support-screenshots/admin/private.png";
const ticket = { id: "ticket_1", userId: "user_1", status: "open", screenshotUrls: [] as string[] };

function screenshot(uploadedBy: string) {
  return {
    customMetadata: { uploadedBy },
    httpMetadata: { contentType: "image/png" },
    arrayBuffer: vi.fn(async () => new ArrayBuffer(1)),
  };
}

function readScreenshot(key: string) {
  return GET(
    new Request(`https://example.com/api/support-screenshot?key=${encodeURIComponent(key)}`),
  );
}

describe("support attachment ownership", () => {
  it("stores a valid screenshot with the authenticated uploader metadata", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "screenshot.png", { type: "image/png" }),
    );
    const response = await uploadScreenshot(
      new Request("https://example.com/api/upload-support-screenshot", {
        method: "POST",
        body: form,
      }),
    );
    expect(response?.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringContaining("support-screenshots/user_1/"),
      new Uint8Array([1, 2, 3]),
      { httpMetadata: { contentType: "image/png" }, customMetadata: { uploadedBy: "user_1" } },
    );
  });

  it("rejects malformed screenshot multipart bodies", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user_1", role: "user" } });
    const response = await uploadScreenshot(
      new Request("https://example.com/api/upload-support-screenshot", {
        method: "POST",
        headers: { "content-type": "multipart/form-data" },
        body: "invalid",
      }),
    );
    expect(response?.status).toBe(400);
  });

  it("rejects a large streamed screenshot body before storage access", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user_1", role: "user" } });
    const cancel = vi.fn();
    let chunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunks++ < 8) controller.enqueue(new Uint8Array(1024 * 1024));
        else controller.close();
      },
      cancel,
    });
    const response = await uploadScreenshot(
      new Request("https://example.com/api/upload-support-screenshot", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(response?.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.head).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user_1", role: "user", email: "user@example.com" },
    });
    mocks.head.mockResolvedValue(screenshot("user_1"));
    mocks.ticketFirst.mockResolvedValue(ticket);
    mocks.ticketMany.mockResolvedValue([]);
    mocks.messageMany.mockResolvedValue([]);
    mocks.messageFirst.mockResolvedValue(null);
    mocks.insert.mockImplementation(() => ({
      values: (values: object) => ({ returning: async () => [{ id: "new_ticket", ...values }] }),
    }));
  });

  it.each(["visa-documents/other/private.pdf", "support-screenshots/other/private.png", adminKey])(
    "rejects an attachment key that the caller does not own: %s",
    async (key) => {
      mocks.head.mockResolvedValue(screenshot("other"));
      await expect(
        submitSupportTicket({
          subject: "Help",
          description: "Upload failed",
          category: "bug",
          screenshotUrls: [key],
        }),
      ).rejects.toThrow();
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it("checks ownership even for a key in the caller's folder", async () => {
    mocks.head.mockResolvedValue(screenshot("other"));
    await expect(
      submitSupportTicket({
        subject: "Help",
        description: "Upload failed",
        category: "bug",
        screenshotUrls: [ownKey],
      }),
    ).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("checks message attachments before inserting the message", async () => {
    mocks.head.mockResolvedValue(screenshot("admin_1"));
    await expect(
      addSupportMessage({ ticketId: ticket.id, content: "Help", screenshotUrls: [adminKey] }),
    ).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("accepts an existing upload owned by the caller", async () => {
    await expect(
      submitSupportTicket({
        subject: "Help",
        description: "Upload failed",
        category: "bug",
        screenshotUrls: [ownKey],
      }),
    ).resolves.toMatchObject({ screenshotUrls: [ownKey] });
  });

  it("does not grant read access from a forged stored admin key", async () => {
    const object = screenshot("admin_1");
    mocks.get.mockResolvedValue(object);
    mocks.ticketMany.mockResolvedValue([{ ...ticket, screenshotUrls: [adminKey] }]);
    expect((await readScreenshot(adminKey))?.status).toBe(403);
    expect(object.arrayBuffer).not.toHaveBeenCalled();
  });

  it("allows a real admin-authored attachment on the user's ticket", async () => {
    mocks.get.mockResolvedValue(screenshot("admin_1"));
    mocks.ticketMany.mockResolvedValue([ticket]);
    mocks.messageMany.mockResolvedValue([{ userId: "admin_1", screenshotUrls: [adminKey] }]);
    expect((await readScreenshot(adminKey))?.status).toBe(200);
  });

  it("checks uploader metadata when reading the caller's folder", async () => {
    mocks.get.mockResolvedValue(screenshot("other"));
    expect((await readScreenshot(ownKey))?.status).toBe(403);
  });

  it("never deletes unrelated objects from poisoned ticket fields", async () => {
    mocks.ticketFirst.mockResolvedValue({
      ...ticket,
      screenshotUrls: ["visa-documents/other/private.pdf", adminKey],
    });
    mocks.head.mockResolvedValue(screenshot("admin_1"));
    await deleteTicket({ ticketId: ticket.id });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps a valid screenshot while another ticket still uses it", async () => {
    mocks.ticketFirst
      .mockResolvedValueOnce({ ...ticket, screenshotUrls: [ownKey] })
      .mockResolvedValueOnce({ id: "other_ticket" });
    await deleteTicket({ ticketId: ticket.id });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes an owned screenshot that has no other references", async () => {
    mocks.ticketFirst
      .mockResolvedValueOnce({ ...ticket, screenshotUrls: [ownKey] })
      .mockResolvedValue(null);
    await deleteTicket({ ticketId: ticket.id });
    expect(mocks.remove).toHaveBeenCalledWith(ownKey);
  });
});
