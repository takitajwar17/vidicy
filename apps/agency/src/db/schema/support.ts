import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";

// Support ticket categories
export const SUPPORT_TICKET_CATEGORY = {
  BUG: 'bug',
  FEEDBACK: 'feedback',
  QUESTION: 'question',
  FEATURE_REQUEST: 'feature_request',
  OTHER: 'other',
} as const;

export const supportTicketCategoryTuple = Object.values(SUPPORT_TICKET_CATEGORY) as [string, ...string[]];

// Support ticket statuses
export const SUPPORT_TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export const supportTicketStatusTuple = Object.values(SUPPORT_TICKET_STATUS) as [string, ...string[]];

// Support ticket priorities
export const SUPPORT_TICKET_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export const supportTicketPriorityTuple = Object.values(SUPPORT_TICKET_PRIORITY) as [string, ...string[]];

// Support ticket table
export const supportTicketTable = sqliteTable("support_ticket", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `supp_${createId()}`).notNull(),
  userId: text().references(() => userTable.id, { onDelete: 'set null' }),
  subject: text({ length: 255 }).notNull(),
  description: text({ length: 5000 }).notNull(),
  category: text({ enum: supportTicketCategoryTuple }).notNull(),
  status: text({ enum: supportTicketStatusTuple }).default(SUPPORT_TICKET_STATUS.OPEN).notNull(),
  priority: text({ enum: supportTicketPriorityTuple }).default(SUPPORT_TICKET_PRIORITY.MEDIUM).notNull(),
  // Up to 3 R2 object keys for screenshots attached by the user
  screenshotUrls: text({ mode: 'json' }).$type<string[]>(),
  // Internal note by admin — not shown to user
  adminNote: text({ length: 2000 }),
  resolvedAt: integer({ mode: "timestamp" }),
  lastViewedAt: integer({ mode: "timestamp" }),
  adminLastViewedAt: integer({ mode: "timestamp" }),
  lastUpdatedAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()),
  userAgent: text({ length: 500 }),
  ipAddress: text({ length: 100 }),
}, (table) => ([
  index('support_ticket_user_id_idx').on(table.userId),
  index('support_ticket_status_idx').on(table.status),
  index('support_ticket_category_idx').on(table.category),
  index('support_ticket_last_updated_at_idx').on(table.lastUpdatedAt),
  // Composite: getUserSupportTickets filters by userId + orders by lastUpdatedAt
  index('support_ticket_user_updated_idx').on(table.userId, table.lastUpdatedAt),
  // Composite: getAllSupportTickets admin filter by status + category
  index('support_ticket_status_category_idx').on(table.status, table.category),
]));

export const supportMessageTable = sqliteTable("support_message", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `smsh_${createId()}`).notNull(),
  ticketId: text().notNull().references(() => supportTicketTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  content: text({ length: 5000 }).notNull(),
  isAdminReply: integer({ mode: "boolean" }).default(false).notNull(),
  isSystemMessage: integer({ mode: "boolean" }).default(false).notNull(),
  // Up to 3 R2 object keys for screenshots attached by user or admin in this message
  screenshotUrls: text({ mode: 'json' }).$type<string[]>(),
}, (table) => ([
  index('support_message_ticket_id_idx').on(table.ticketId),
  index('support_message_user_id_idx').on(table.userId),
  index('support_message_created_at_idx').on(table.createdAt),
]));

export type SupportTicket = InferSelectModel<typeof supportTicketTable>;
export type SupportMessage = InferSelectModel<typeof supportMessageTable>;
