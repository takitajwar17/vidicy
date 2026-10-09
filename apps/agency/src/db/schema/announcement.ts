import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import {
  AnyPgColumn,
  integer,
  index,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
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

export const announcementTypeTuple = Object.values(ANNOUNCEMENT_TYPE) as [
  (typeof ANNOUNCEMENT_TYPE)[keyof typeof ANNOUNCEMENT_TYPE],
  ...(typeof ANNOUNCEMENT_TYPE)[keyof typeof ANNOUNCEMENT_TYPE][],
];

export const ANNOUNCEMENT_PRIORITY = {
  NORMAL: "normal",
  IMPORTANT: "important",
  CRITICAL: "critical",
} as const;

export const announcementPriorityTuple = Object.values(ANNOUNCEMENT_PRIORITY) as [
  (typeof ANNOUNCEMENT_PRIORITY)[keyof typeof ANNOUNCEMENT_PRIORITY],
  ...(typeof ANNOUNCEMENT_PRIORITY)[keyof typeof ANNOUNCEMENT_PRIORITY][],
];

export const announcementPostTable = pgTable(
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
    title: text().notNull(),
    body: text().notNull(),
    attachments: jsonb().$type<AnnouncementAttachment[]>(),
    ctaLabel: text(),
    ctaUrl: text(),
    embedTitle: text(),
    embedUrl: text(),
    type: text({ enum: announcementTypeTuple }).notNull().default(ANNOUNCEMENT_TYPE.ANNOUNCEMENT),
    priority: text({ enum: announcementPriorityTuple })
      .notNull()
      .default(ANNOUNCEMENT_PRIORITY.NORMAL),
    pinned: boolean().notNull().default(false),
    commentsEnabled: boolean().notNull().default(true),
    pollSingleChoice: boolean().notNull().default(true),
    pollNamedVotes: boolean().notNull().default(true),
    pollAllowVoteChange: boolean().notNull().default(true),
    pollCloseAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    emailNotificationSent: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
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

export const announcementPollOptionTable = pgTable(
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
    label: text().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [index("announcement_poll_option_post_idx").on(table.postId)],
);

export const announcementPollVoteTable = pgTable(
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

export const announcementUpvoteTable = pgTable(
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

export const announcementCommentTable = pgTable(
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
    parentId: text().references((): AnyPgColumn => announcementCommentTable.id, {
      onDelete: "cascade",
    }),
    body: text().notNull(),
  },
  (table) => [
    index("announcement_comment_post_idx").on(table.postId),
    index("announcement_comment_parent_idx").on(table.parentId),
    index("announcement_comment_user_idx").on(table.userId),
  ],
);

export const announcementReadTable = pgTable(
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
    readAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
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
