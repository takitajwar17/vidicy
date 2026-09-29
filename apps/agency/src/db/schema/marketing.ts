import { type InferSelectModel } from "drizzle-orm";
import { integer, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";

export const MARKETING_SEQUENCE = {
  ONBOARDING: "onboarding",
  POST_PURCHASE: "post_purchase",
  WINBACK: "winback",
} as const;

export const marketingSequenceTuple = Object.values(MARKETING_SEQUENCE) as [string, ...string[]];

export const MARKETING_ENROLLMENT_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  EXITED: "exited",
} as const;

export const marketingEnrollmentStatusTuple = Object.values(MARKETING_ENROLLMENT_STATUS) as [string, ...string[]];

export const MARKETING_EVENT_TYPE = {
  USER_VERIFIED_EMAIL: "user_verified_email",
  APPLICATION_CREATED: "application_created",
  DOCUMENT_UPLOADED: "document_uploaded",
  EVALUATION_COMPLETED: "evaluation_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",
} as const;

export const marketingEventTypeTuple = Object.values(MARKETING_EVENT_TYPE) as [string, ...string[]];

export const MARKETING_SEND_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  CANCELED: "canceled",
} as const;

export const marketingSendStatusTuple = Object.values(MARKETING_SEND_STATUS) as [string, ...string[]];

export const marketingContactTable = sqliteTable("marketing_contact", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `mct_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: "cascade" }),
  email: text({ length: 255 }).notNull(),
  resendContactId: text({ length: 255 }),
  subscribedOnboarding: integer({ mode: "boolean" }).default(true).notNull(),
  subscribedPostPurchase: integer({ mode: "boolean" }).default(true).notNull(),
  subscribedWinback: integer({ mode: "boolean" }).default(true).notNull(),
  lastSyncedAt: integer({ mode: "timestamp" }),
}, (table) => ([
  uniqueIndex("marketing_contact_user_unique_idx").on(table.userId),
  uniqueIndex("marketing_contact_email_unique_idx").on(table.email),
  uniqueIndex("marketing_contact_resend_contact_unique_idx").on(table.resendContactId),
]));

export const marketingSequenceEnrollmentTable = sqliteTable("marketing_sequence_enrollment", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `mseq_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: "cascade" }),
  applicationId: text().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
  sequence: text({ enum: marketingSequenceTuple }).notNull(),
  stepKey: text({ length: 255 }).notNull(),
  status: text({ enum: marketingEnrollmentStatusTuple }).default(MARKETING_ENROLLMENT_STATUS.ACTIVE).notNull(),
  enteredAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  nextSendAt: integer({ mode: "timestamp" }).notNull(),
  lastSentAt: integer({ mode: "timestamp" }),
  completedAt: integer({ mode: "timestamp" }),
  exitReason: text({ length: 255 }),
}, (table) => ([
  index("marketing_enrollment_user_idx").on(table.userId),
  index("marketing_enrollment_application_idx").on(table.applicationId),
  index("marketing_enrollment_sequence_status_idx").on(table.sequence, table.status),
  index("marketing_enrollment_next_send_idx").on(table.nextSendAt),
]));

export const marketingEmailSendTable = sqliteTable("marketing_email_send", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `msend_${createId()}`).notNull(),
  enrollmentId: text().notNull().references(() => marketingSequenceEnrollmentTable.id, { onDelete: "cascade" }),
  sequence: text({ enum: marketingSequenceTuple }).notNull(),
  stepKey: text({ length: 255 }).notNull(),
  resendBroadcastId: text({ length: 255 }),
  resendSegmentId: text({ length: 255 }),
  status: text({ enum: marketingSendStatusTuple }).default(MARKETING_SEND_STATUS.PENDING).notNull(),
  sentAt: integer({ mode: "timestamp" }),
}, (table) => ([
  index("marketing_send_enrollment_idx").on(table.enrollmentId),
  index("marketing_send_status_idx").on(table.status),
  uniqueIndex("marketing_send_broadcast_unique_idx").on(table.resendBroadcastId),
]));

export const marketingEventTable = sqliteTable("marketing_event", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `mevt_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: "cascade" }),
  applicationId: text().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
  type: text({ enum: marketingEventTypeTuple }).notNull(),
  payload: text({ mode: "json" }).$type<Record<string, unknown>>(),
  occurredAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("marketing_event_user_idx").on(table.userId),
  index("marketing_event_application_idx").on(table.applicationId),
  index("marketing_event_type_idx").on(table.type),
  index("marketing_event_occurred_at_idx").on(table.occurredAt),
]));

export type MarketingContact = InferSelectModel<typeof marketingContactTable>;
export type MarketingSequenceEnrollment = InferSelectModel<typeof marketingSequenceEnrollmentTable>;
export type MarketingEmailSend = InferSelectModel<typeof marketingEmailSendTable>;
export type MarketingEvent = InferSelectModel<typeof marketingEventTable>;
