import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import {
  AnySQLiteColumn,
  integer,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { commonColumns } from "./_common";
import { userTable } from "./user";
import type { AnnouncementAttachment } from "@/lib/announcements";

export const ANNOUNCEMENT_TYPE = {
  ANNOUNCEMENT: "announcement",
  RELEASE_NOTE: "release_note",
  MAINTENANCE: "maintenance",
  POLL: "poll",
  EVENT: "event",
  ACTION_REQUIRED: "action_required",
} as const;

export const announcementTypeTuple = Object.values(ANNOUNCEMENT_TYPE) as [string, ...string[]];

export const ANNOUNCEMENT_PRIORITY = {
  NORMAL: "normal",
  IMPORTANT: "important",
  CRITICAL: "critical",
} as const;

export const announcementPriorityTuple = Object.values(ANNOUNCEMENT_PRIORITY) as [
  string,
  ...string[],
];

export const announcementPostTable = sqliteTable(
  "announcement_post",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `annp_${createId()}`)
      .notNull(),
    authorId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    title: text({ length: 255 }).notNull(),
    body: text({ length: 20000 }).notNull(),
    attachments: text({ mode: "json" }).$type<AnnouncementAttachment[]>(),
    ctaLabel: text({ length: 80 }),
    ctaUrl: text({ length: 2048 }),
    embedTitle: text({ length: 120 }),
    embedUrl: text({ length: 2048 }),
    type: text({ enum: announcementTypeTuple }).notNull().default(ANNOUNCEMENT_TYPE.ANNOUNCEMENT),
    priority: text({ enum: announcementPriorityTuple })
      .notNull()
      .default(ANNOUNCEMENT_PRIORITY.NORMAL),
    pinned: integer({ mode: "boolean" }).notNull().default(false),
    commentsEnabled: integer({ mode: "boolean" }).notNull().default(true),
    pollSingleChoice: integer({ mode: "boolean" }).notNull().default(true),
    pollNamedVotes: integer({ mode: "boolean" }).notNull().default(true),
    pollAllowVoteChange: integer({ mode: "boolean" }).notNull().default(true),
    pollCloseAt: integer({ mode: "timestamp" }),
    emailNotificationSent: integer({ mode: "boolean" }).notNull().default(false),
    publishedAt: integer({ mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("announcement_post_author_idx").on(table.authorId),
    index("announcement_post_type_idx").on(table.type),
    index("announcement_post_priority_idx").on(table.priority),
    index("announcement_post_pinned_idx").on(table.pinned),
    index("announcement_post_published_idx").on(table.publishedAt),
  ],
);

export const announcementPollOptionTable = sqliteTable(
  "announcement_poll_option",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `anpo_${createId()}`)
      .notNull(),
    postId: text()
      .notNull()
      .references(() => announcementPostTable.id, { onDelete: "cascade" }),
    label: text({ length: 255 }).notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [index("announcement_poll_option_post_idx").on(table.postId)],
);

export const announcementPollVoteTable = sqliteTable(
  "announcement_poll_vote",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `anpv_${createId()}`)
      .notNull(),
    postId: text()
      .notNull()
      .references(() => announcementPostTable.id, { onDelete: "cascade" }),
    optionId: text()
      .notNull()
      .references(() => announcementPollOptionTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("announcement_poll_vote_unique_user_post_option").on(
      table.postId,
      table.userId,
      table.optionId,
    ),
    index("announcement_poll_vote_post_idx").on(table.postId),
    index("announcement_poll_vote_user_idx").on(table.userId),
  ],
);

export const announcementUpvoteTable = sqliteTable(
  "announcement_upvote",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `annu_${createId()}`)
      .notNull(),
    postId: text()
      .notNull()
      .references(() => announcementPostTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("announcement_upvote_unique_user_post").on(table.postId, table.userId),
    index("announcement_upvote_post_idx").on(table.postId),
  ],
);

export const announcementCommentTable = sqliteTable(
  "announcement_comment",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `annc_${createId()}`)
      .notNull(),
    postId: text()
      .notNull()
      .references(() => announcementPostTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    parentId: text().references((): AnySQLiteColumn => announcementCommentTable.id, {
      onDelete: "cascade",
    }),
    body: text({ length: 5000 }).notNull(),
  },
  (table) => [
    index("announcement_comment_post_idx").on(table.postId),
    index("announcement_comment_parent_idx").on(table.parentId),
    index("announcement_comment_user_idx").on(table.userId),
  ],
);

export const announcementReadTable = sqliteTable(
  "announcement_read",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `annr_${createId()}`)
      .notNull(),
    postId: text()
      .notNull()
      .references(() => announcementPostTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    readAt: integer({ mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("announcement_read_unique_user_post").on(table.postId, table.userId),
    index("announcement_read_user_idx").on(table.userId),
  ],
);

export type AnnouncementPost = InferSelectModel<typeof announcementPostTable>;
export type AnnouncementComment = InferSelectModel<typeof announcementCommentTable>;
