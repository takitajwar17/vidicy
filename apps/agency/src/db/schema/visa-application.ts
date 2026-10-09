import { pgTable, integer, text, index, timestamp, jsonb } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";

// Visa Application Status
export const VISA_APPLICATION_STATUS = {
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  READY: "ready",
  SUBMITTED: "submitted",
} as const;

export const visaApplicationStatusTuple = Object.values(VISA_APPLICATION_STATUS) as [
  string,
  ...string[],
];

// Risk Level
export const RISK_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export const riskLevelTuple = Object.values(RISK_LEVEL) as [string, ...string[]];

export const SCORE_CONFIDENCE = {
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
} as const;

export const scoreConfidenceTuple = Object.values(SCORE_CONFIDENCE) as [string, ...string[]];

// Actual visa outcome — recorded after the embassy makes a real decision
export const VISA_OUTCOME = {
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export const visaOutcomeTuple = Object.values(VISA_OUTCOME) as [string, ...string[]];

export const AGENCY_CASE_STATUS = {
  INTAKE: "intake",
  NEEDS_CLIENT: "needs_client",
  IN_REVIEW: "in_review",
  READY_TO_SUBMIT: "ready_to_submit",
} as const;

export const agencyCaseStatusTuple = Object.values(AGENCY_CASE_STATUS) as [string, ...string[]];

export const AGENCY_CASE_PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export const agencyCasePriorityTuple = Object.values(AGENCY_CASE_PRIORITY) as [string, ...string[]];

export const CLIENT_REPORT_STATUS = {
  NOT_STARTED: "not_started",
  DRAFT: "draft",
  READY: "ready",
  SENT: "sent",
} as const;

export const clientReportStatusTuple = Object.values(CLIENT_REPORT_STATUS) as [string, ...string[]];

// Visa application table
export const visaApplicationTable = pgTable(
  "visa_application",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `vapp_${createId()}`)
      .notNull(),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    homeCountry: text().notNull(),
    currentCountry: text().notNull(),
    destinationCountry: text().notNull(),
    visaType: text().notNull(),
    embassy: text().notNull(),
    status: text({ enum: visaApplicationStatusTuple })
      .default(VISA_APPLICATION_STATUS.DRAFT)
      .notNull(),
    riskLevel: text({ enum: riskLevelTuple }),
    readinessScore: integer(),
    trashedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    // Collaboration workspace fields — always populated for new rows; .notNull() with
    // safe defaults ensures queries never need null-coalescing fallbacks.
    name: text().notNull().default(""),
    settings: text().notNull().default("{}"),
    // Checklist generation metadata — canonical typed alternatives to the legacy settings blob
    checklistSource: text(),
    checklistGeneratedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    checklistCitations: jsonb().$type<string[]>(),
    // Outcome tracking — recorded after the embassy issues a real decision
    actualOutcome: text({ enum: visaOutcomeTuple }),
    outcomeDate: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    outcomeNotes: text(),
    // Agency workflow fields. The database table name is retained for backward
    // compatibility, but authenticated agency surfaces treat this row as a client case.
    caseNumber: text().unique(),
    clientId: text(),
    clientName: text(),
    clientEmail: text(),
    clientPhone: text(),
    agencyStatus: text({ enum: agencyCaseStatusTuple })
      .default(AGENCY_CASE_STATUS.INTAKE)
      .notNull(),
    priority: text({ enum: agencyCasePriorityTuple })
      .default(AGENCY_CASE_PRIORITY.NORMAL)
      .notNull(),
    assignedReviewerId: text().references(() => userTable.id, { onDelete: "set null" }),
    intakeSource: text().default("manual").notNull(),
    submittedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    dueAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    reviewCompletedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    finalSubmissionAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    clientReportStatus: text({ enum: clientReportStatusTuple })
      .default(CLIENT_REPORT_STATUS.NOT_STARTED)
      .notNull(),
  },
  (table) => [
    index("visa_app_user_id_idx").on(table.userId),
    index("visa_app_status_idx").on(table.status),
    index("visa_app_agency_status_idx").on(table.agencyStatus),
    index("visa_app_case_number_idx").on(table.caseNumber),
    index("visa_app_client_id_idx").on(table.clientId),
    index("visa_app_assigned_reviewer_idx").on(table.assignedReviewerId),
    index("visa_app_priority_idx").on(table.priority),
    index("visa_app_created_at_idx").on(table.createdAt),
    index("visa_app_user_created_idx").on(table.userId, table.createdAt),
    index("visa_app_user_trashed_created_idx").on(table.userId, table.trashedAt, table.createdAt),
    index("visa_app_status_created_idx").on(table.agencyStatus, table.createdAt),
  ],
);

export type VisaApplication = InferSelectModel<typeof visaApplicationTable>;
