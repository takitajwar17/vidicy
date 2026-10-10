import { pgTable, text, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { visaApplicationTable } from "./visa-application";
import { applicantTable } from "./applicant";
import { userTable } from "./user";
import { documentEvaluationTable } from "./document";

export const reviewJobTable = pgTable(
  "review_job",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => `rjob_${createId()}`),
    applicationId: text()
      .notNull()
      .references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    applicantId: text()
      .notNull()
      .references(() => applicantTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    status: text({ enum: ["queued", "running", "succeeded", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer().notNull().default(0),
    recoveryCount: integer().notNull().default(0),
    claimToken: text(),
    leaseUntil: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    evaluationId: text().references(() => documentEvaluationTable.id, { onDelete: "set null" }),
    error: text(),
    metrics: jsonb().$type<{
      durationMs: number;
      calls: import("@/infra/evaluation-metrics").EvaluationCallMetric[];
    }>(),
    createdAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    finishedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  },
  (table) => [
    uniqueIndex("review_job_active_applicant_idx")
      .on(table.applicantId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("review_job_lookup_idx").on(table.applicationId, table.applicantId, table.createdAt),
    index("review_job_recovery_idx").on(table.status, table.updatedAt),
  ],
);
