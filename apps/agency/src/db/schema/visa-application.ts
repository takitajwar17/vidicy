import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";

// Visa Application Status
export const VISA_APPLICATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  READY: 'ready',
  SUBMITTED: 'submitted',
} as const;

export const visaApplicationStatusTuple = Object.values(VISA_APPLICATION_STATUS) as [string, ...string[]];

// Risk Level
export const RISK_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export const riskLevelTuple = Object.values(RISK_LEVEL) as [string, ...string[]];

export const SCORE_CONFIDENCE = {
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
} as const;

export const scoreConfidenceTuple = Object.values(SCORE_CONFIDENCE) as [string, ...string[]];

// Actual visa outcome — recorded after the embassy makes a real decision
export const VISA_OUTCOME = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const visaOutcomeTuple = Object.values(VISA_OUTCOME) as [string, ...string[]];

// Payment status for an application
export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
} as const;

export const paymentStatusTuple = Object.values(PAYMENT_STATUS) as [string, ...string[]];

// Visa application table
export const visaApplicationTable = sqliteTable("visa_application", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `vapp_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  homeCountry: text({ length: 100 }).notNull(),
  currentCountry: text({ length: 100 }).notNull(),
  destinationCountry: text({ length: 100 }).notNull(),
  visaType: text({ length: 100 }).notNull(),
  embassy: text({ length: 255 }).notNull(),
  status: text({ enum: visaApplicationStatusTuple }).default(VISA_APPLICATION_STATUS.DRAFT).notNull(),
  riskLevel: text({ enum: riskLevelTuple }),
  readinessScore: integer(),
  trashedAt: integer({ mode: "timestamp" }),
  // Collaboration workspace fields — always populated for new rows; .notNull() with
  // safe defaults ensures queries never need null-coalescing fallbacks.
  name: text({ length: 255 }).notNull().default(""),
  settings: text({ length: 10000 }).notNull().default("{}"),
  // Checklist generation metadata — canonical typed alternatives to the legacy settings blob
  checklistSource: text({ length: 50 }),
  checklistGeneratedAt: integer({ mode: "timestamp" }),
  checklistCitations: text({ mode: 'json' }).$type<string[]>(),
  // Outcome tracking — recorded after the embassy issues a real decision
  actualOutcome: text({ enum: visaOutcomeTuple }),
  outcomeDate: integer({ mode: "timestamp" }),
  outcomeNotes: text({ length: 1000 }),
  // Payment tracking
  paymentStatus: text({ enum: paymentStatusTuple }).default(PAYMENT_STATUS.UNPAID).notNull(),
  stripePaymentIntentId: text({ length: 255 }),
  /** Which plan was purchased: 'solo' or 'family' */
  plan: text({ length: 20 }),
  /** How many applicants have been paid for so far */
  paidApplicantCount: integer().default(0).notNull(),
  /** Whether this is the user's free trial application */
  isFreeTrialApp: integer({ mode: "boolean" }).default(false).notNull(),
  /** Whether the single free evaluation has been used */
  freeEvaluationUsed: integer({ mode: "boolean" }).default(false).notNull(),
}, (table) => ([
  index('visa_app_user_id_idx').on(table.userId),
  index('visa_app_status_idx').on(table.status),
  index('visa_app_created_at_idx').on(table.createdAt),
  index('visa_app_user_created_idx').on(table.userId, table.createdAt),
  index('visa_app_user_trashed_created_idx').on(table.userId, table.trashedAt, table.createdAt),
]));

export type VisaApplication = InferSelectModel<typeof visaApplicationTable>;
