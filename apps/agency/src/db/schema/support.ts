import { pgTable, text, index, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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
export const supportTicketTable = pgTable("support_ticket", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `supp_${createId()}`).notNull(),
  userId: text().references(() => userTable.id, { onDelete: 'set null' }),
  subject: text().notNull(),
  description: text().notNull(),
  category: text({ enum: supportTicketCategoryTuple }).notNull(),
  status: text({ enum: supportTicketStatusTuple }).default(SUPPORT_TICKET_STATUS.OPEN).notNull(),
  priority: text({ enum: supportTicketPriorityTuple }).default(SUPPORT_TICKET_PRIORITY.MEDIUM).notNull(),
  // Up to 3 R2 object keys for screenshots attached by the user
  screenshotUrls: jsonb().$type<string[]>(),
  // Internal note by admin — not shown to user
  adminNote: text(),
  resolvedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  lastViewedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  adminLastViewedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  lastUpdatedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).$defaultFn(() => new Date()),
  userAgent: text(),
  ipAddress: text(),
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

export const supportMessageTable = pgTable("support_message", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `smsh_${createId()}`).notNull(),
  ticketId: text().notNull().references(() => supportTicketTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  content: text().notNull(),
  isAdminReply: boolean().default(false).notNull(),
  isSystemMessage: boolean().default(false).notNull(),
  // Up to 3 R2 object keys for screenshots attached by user or admin in this message
  screenshotUrls: jsonb().$type<string[]>(),
}, (table) => ([
  index('support_message_ticket_id_idx').on(table.ticketId),
  index('support_message_user_id_idx').on(table.userId),
  index('support_message_created_at_idx').on(table.createdAt),
]));

export type SupportTicket = InferSelectModel<typeof supportTicketTable>;
export type SupportMessage = InferSelectModel<typeof supportMessageTable>;
