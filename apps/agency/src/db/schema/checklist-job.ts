import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { visaApplicationTable } from "./visa-application";
import { applicantTable } from "./applicant";
import { userTable } from "./user";

export const checklistJobTable = pgTable(
  "checklist_job",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => `cjob_${createId()}`),
    applicationId: text()
      .notNull()
      .references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    applicantId: text()
      .notNull()
      .references(() => applicantTable.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    refreshResearch: boolean().notNull().default(false),
    contextHash: text().notNull(),
    status: text({ enum: ["queued", "running", "succeeded", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer().notNull().default(0),
    recoveryCount: integer().notNull().default(0),
    claimToken: text(),
    leaseUntil: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    error: text(),
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
    uniqueIndex("checklist_job_active_applicant_idx")
      .on(table.applicantId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("checklist_job_lookup_idx").on(table.applicationId, table.applicantId, table.createdAt),
    index("checklist_job_recovery_idx").on(table.status, table.updatedAt),
  ],
);
