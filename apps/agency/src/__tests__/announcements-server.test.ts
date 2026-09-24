import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const {
  mockGetSessionFromCookie,
  mockCheckActionRateLimit,
  mockSendEmailBestEffort,
  mockSendAnnouncementNotificationEmail,
  mockDbInsert,
  mockDbUpdate,
  mockInsertValues,
  mockInsertReturning,
  mockOptionInsertValues,
  mockUpdateSet,
  mockUpdateWhere,
  mockFindRecipients,
  mockPostTable,
  mockPollOptionTable,
} = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockSendEmailBestEffort: vi.fn(),
  mockSendAnnouncementNotificationEmail: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockOptionInsertValues: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockFindRecipients: vi.fn(),
  mockPostTable: { __name: "announcement_post", id: "announcement_post.id" },
  mockPollOptionTable: { __name: "announcement_poll_option" },
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/infra/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

vi.mock("@/lib/best-effort-email", () => ({
  sendEmailBestEffort: mockSendEmailBestEffort,
}));

vi.mock("@/utils/email", () => ({
  sendAnnouncementNotificationEmail: mockSendAnnouncementNotificationEmail,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  like: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  ANNOUNCEMENT_PRIORITY: {
    NORMAL: "normal",
    IMPORTANT: "important",
    CRITICAL: "critical",
  },
  ANNOUNCEMENT_TYPE: {
    ANNOUNCEMENT: "announcement",
    RELEASE_NOTE: "release_note",
    MAINTENANCE: "maintenance",
    POLL: "poll",
    EVENT: "event",
    ACTION_REQUIRED: "action_required",
  },
  announcementCommentTable: {},
  announcementPollOptionTable: mockPollOptionTable,
  announcementPollVoteTable: {},
  announcementPostTable: mockPostTable,
  announcementReadTable: {},
  announcementUpvoteTable: {},
  ROLES_ENUM: {
    ADMIN: "admin",
  },
  userTable: {
    id: "user.id",
    email: "user.email",
    emailVerified: "user.emailVerified",
  },
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: {
      userTable: {
        findMany: mockFindRecipients,
      },
    },
  }),
}));

import { ZSAError } from "zsa";
import { createAnnouncement } from "@/server/announcements";

describe("createAnnouncement", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSessionFromCookie.mockResolvedValue({
      user: {
        id: "usr_admin",
        role: "admin",
      },
    });

    mockInsertReturning.mockResolvedValue([
      {
        id: "annp_123",
        title: "Platform update",
        type: "announcement",
        priority: "important",
        emailNotificationSent: false,
      },
    ]);

    mockInsertValues.mockImplementation(() => ({
      returning: mockInsertReturning,
    }));

    mockOptionInsertValues.mockResolvedValue(undefined);

    mockDbInsert.mockImplementation((table: { __name?: string }) => {
      if (table === mockPostTable) {
        return { values: mockInsertValues };
      }

      if (table === mockPollOptionTable) {
        return { values: mockOptionInsertValues };
      }

      throw new Error(`Unexpected insert table: ${String(table?.__name ?? table)}`);
    });

    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockImplementation(() => ({
      where: mockUpdateWhere,
    }));
    mockDbUpdate.mockImplementation((table: unknown) => {
      if (table !== mockPostTable) {
        throw new Error(`Unexpected update table: ${String(table)}`);
      }

      return {
        set: mockUpdateSet,
      };
    });

    mockFindRecipients.mockResolvedValue([{ email: "team@example.com" }]);
    mockSendEmailBestEffort.mockResolvedValue(true);
  });

  it("rejects invalid poll payloads before inserting a post", async () => {
    await expect(
      createAnnouncement({
        title: "Vote now",
        body: "Pick one",
        type: "poll",
        priority: "normal",
        pollOptions: ["Only one"],
      }),
    ).rejects.toMatchObject({
      code: "INPUT_PARSE_ERROR",
    } satisfies Partial<ZSAError>);

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("treats notification email as best-effort and updates sent state only on success", async () => {
    const post = await createAnnouncement({
      title: "Platform update",
      body: "Body",
      type: "announcement",
      priority: "important",
      sendEmail: true,
    });

    expect(post.emailNotificationSent).toBe(true);
    expect(mockSendEmailBestEffort).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith({ emailNotificationSent: true });
  });

  it("does not fail the publish flow when the email send fails", async () => {
    mockSendEmailBestEffort.mockResolvedValue(false);

    const post = await createAnnouncement({
      title: "Platform update",
      body: "Body",
      type: "announcement",
      priority: "important",
      sendEmail: true,
    });

    expect(post.emailNotificationSent).toBe(false);
    expect(mockSendEmailBestEffort).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("selects avatar and role fields for announcement authors and commenters", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/announcements.ts"), "utf8");

    expect(source).toContain("authorAvatar");
    expect(source).toContain("authorRole");
    expect(source).toContain("avatar: userTable.avatar");
    expect(source).toContain("role: userTable.role");
  });
});
