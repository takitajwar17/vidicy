import { type InferSelectModel } from "drizzle-orm";
import { integer, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";

export const PAYMENT_EVENT_TYPE = {
  INITIAL_PURCHASE: "initial_purchase",
  ADDITIONAL_APPLICANT: "additional_applicant",
} as const;

export const paymentEventTypeTuple = Object.values(PAYMENT_EVENT_TYPE) as [string, ...string[]];

export const PAYMENT_EVENT_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  REFUNDED: "refunded",
  EXPIRED: "expired",
} as const;

export const paymentEventStatusTuple = Object.values(PAYMENT_EVENT_STATUS) as [string, ...string[]];

export const paymentEventTable = sqliteTable("payment_event", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pevt_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
  userId: text().notNull().references(() => userTable.id, { onDelete: "cascade" }),
  type: text({ enum: paymentEventTypeTuple }).notNull(),
  status: text({ enum: paymentEventStatusTuple }).notNull().default(PAYMENT_EVENT_STATUS.PENDING),
  amount: integer().notNull(),
  currency: text({ length: 10 }).notNull().default("usd"),
  seatDelta: integer().notNull().default(0),
  targetPaidApplicantCount: integer().notNull().default(0),
  plan: text({ length: 20 }),
  stripeCheckoutSessionId: text({ length: 255 }).notNull(),
  stripeCheckoutSessionUrl: text({ length: 2000 }),
  stripeCheckoutSessionExpiresAt: integer({ mode: "timestamp" }),
  stripePaymentIntentId: text({ length: 255 }),
}, (table) => ([
  index("payment_event_app_id_idx").on(table.applicationId),
  index("payment_event_status_idx").on(table.status),
  index("payment_event_app_type_status_created_idx").on(
    table.applicationId,
    table.type,
    table.status,
    table.createdAt,
  ),
  uniqueIndex("payment_event_checkout_session_unique_idx").on(table.stripeCheckoutSessionId),
  uniqueIndex("payment_event_payment_intent_unique_idx").on(table.stripePaymentIntentId),
]));

export type PaymentEvent = InferSelectModel<typeof paymentEventTable>;
