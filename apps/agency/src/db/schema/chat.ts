import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { visaApplicationTable } from "./visa-application";

// Chat message roles
export const CHAT_ROLE = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

export const chatRoleTuple = Object.values(CHAT_ROLE) as [string, ...string[]];

// Chat conversation table
export const chatConversationTable = sqliteTable("chat_conversation", {
  id: text().primaryKey().$defaultFn(() => `cconv_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  name: text({ length: 100 }).notNull().default("New chat"),
  createdAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()).notNull().$onUpdateFn(() => new Date()),
}, (table) => ([
  index('chat_conv_app_id_idx').on(table.applicationId),
  index('chat_conv_app_updated_idx').on(table.applicationId, table.updatedAt),
]));

export type ChatConversation = InferSelectModel<typeof chatConversationTable>;

// Chat message table
export const chatMessageTable = sqliteTable("chat_message", {
  id: text().primaryKey().$defaultFn(() => `cmsg_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  conversationId: text().references(() => chatConversationTable.id, { onDelete: 'cascade' }),
  role: text({ enum: chatRoleTuple }).notNull(),
  content: text({ length: 10000 }).notNull(),
  // JPEG data URL of the first page of an attached PDF (base64). Only set on user
  // messages that include a PDF attachment — null for all other messages.
  thumbnailDataUrl: text(),
  createdAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index('chat_msg_app_id_idx').on(table.applicationId),
  index('chat_msg_conv_id_idx').on(table.conversationId),
  index('chat_msg_created_at_idx').on(table.createdAt),
  index('chat_msg_conv_created_idx').on(table.conversationId, table.createdAt),
]));

export type ChatMessage = InferSelectModel<typeof chatMessageTable>;
