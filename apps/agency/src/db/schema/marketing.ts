import { type InferSelectModel } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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

export const marketingEnrollmentStatusTuple = Object.values(MARKETING_ENROLLMENT_STATUS) as [
  string,
  ...string[],
];

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

export const marketingSendStatusTuple = Object.values(MARKETING_SEND_STATUS) as [
  string,
  ...string[],
];

export const marketingContactTable = pgTable(
  "marketing_contact",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `mct_${createId()}`)
      .notNull(),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    email: text().notNull(),
    resendContactId: text(),
    subscribedOnboarding: boolean().default(true).notNull(),
    subscribedPostPurchase: boolean().default(true).notNull(),
    subscribedWinback: boolean().default(true).notNull(),
    lastSyncedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  },
  (table) => [
    uniqueIndex("marketing_contact_user_unique_idx").on(table.userId),
    uniqueIndex("marketing_contact_email_unique_idx").on(table.email),
    uniqueIndex("marketing_contact_resend_contact_unique_idx").on(table.resendContactId),
  ],
);

export const marketingSequenceEnrollmentTable = pgTable(
  "marketing_sequence_enrollment",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `mseq_${createId()}`)
      .notNull(),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    applicationId: text().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    sequence: text({ enum: marketingSequenceTuple }).notNull(),
    stepKey: text().notNull(),
    status: text({ enum: marketingEnrollmentStatusTuple })
      .default(MARKETING_ENROLLMENT_STATUS.ACTIVE)
      .notNull(),
    enteredAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
      .$defaultFn(() => new Date())
      .notNull(),
    nextSendAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).notNull(),
    lastSentAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    completedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    exitReason: text(),
  },
  (table) => [
    index("marketing_enrollment_user_idx").on(table.userId),
    index("marketing_enrollment_application_idx").on(table.applicationId),
    index("marketing_enrollment_sequence_status_idx").on(table.sequence, table.status),
    index("marketing_enrollment_next_send_idx").on(table.nextSendAt),
  ],
);

export const marketingEmailSendTable = pgTable(
  "marketing_email_send",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `msend_${createId()}`)
      .notNull(),
    enrollmentId: text()
      .notNull()
      .references(() => marketingSequenceEnrollmentTable.id, { onDelete: "cascade" }),
    sequence: text({ enum: marketingSequenceTuple }).notNull(),
    stepKey: text().notNull(),
    resendBroadcastId: text(),
    resendSegmentId: text(),
    status: text({ enum: marketingSendStatusTuple })
      .default(MARKETING_SEND_STATUS.PENDING)
      .notNull(),
    sentAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  },
  (table) => [
    index("marketing_send_enrollment_idx").on(table.enrollmentId),
    index("marketing_send_status_idx").on(table.status),
    uniqueIndex("marketing_send_broadcast_unique_idx").on(table.resendBroadcastId),
  ],
);

export const marketingEventTable = pgTable(
  "marketing_event",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `mevt_${createId()}`)
      .notNull(),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    applicationId: text().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    type: text({ enum: marketingEventTypeTuple }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>(),
    occurredAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("marketing_event_user_idx").on(table.userId),
    index("marketing_event_application_idx").on(table.applicationId),
    index("marketing_event_type_idx").on(table.type),
    index("marketing_event_occurred_at_idx").on(table.occurredAt),
  ],
);

export type MarketingContact = InferSelectModel<typeof marketingContactTable>;
export type MarketingSequenceEnrollment = InferSelectModel<typeof marketingSequenceEnrollmentTable>;
export type MarketingEmailSend = InferSelectModel<typeof marketingEmailSendTable>;
export type MarketingEvent = InferSelectModel<typeof marketingEventTable>;
