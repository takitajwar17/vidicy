import { sqliteTable, integer, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable, riskLevelTuple } from "./visa-application";

// Applicant relationship types
export const APPLICANT_RELATIONSHIP = {
  PRIMARY: 'primary',
  SPOUSE: 'spouse',
  CHILD: 'child',
  PARENT: 'parent',
  SIBLING: 'sibling',
  OTHER: 'other',
} as const;

export const applicantRelationshipTuple = Object.values(APPLICANT_RELATIONSHIP) as [string, ...string[]];

// Legacy applicant role retained for older records.
export const APPLICANT_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

export const applicantRoleTuple = Object.values(APPLICANT_ROLE) as [string, ...string[]];

// Applicant table — one per person in the visa application
export const applicantTable = sqliteTable("applicant", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `appl_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  name: text({ length: 255 }).notNull(),
  relationship: text({ enum: applicantRelationshipTuple }).notNull(),
  /**
   * Legacy applicant role. Agency reviewers work from agency_team_member;
   * applicant rows keep this value for older records and compatibility.
   */
  role: text({ enum: applicantRoleTuple }).notNull().default(APPLICANT_ROLE.OWNER),
  dateOfBirth: text({ length: 20 }),
  passportNumber: text({ length: 100 }),
  /** Nationality / passport-issuing country for this specific applicant */
  nationality: text({ length: 100 }),
  readinessScore: integer(),
  riskLevel: text({ enum: riskLevelTuple }),
  email: text({ length: 255 }),
  /** Set once a user account is linked to this applicant */
  userId: text().references(() => userTable.id, { onDelete: 'set null' }),
  // Per-applicant visa history
  approvedBefore: integer({ mode: "boolean" }),
  approvedVisaType: text({ length: 100 }),
  approvedYear: text({ length: 10 }),
  rejectedBefore: integer({ mode: "boolean" }),
  rejectedVisaType: text({ length: 100 }),
  rejectedYear: text({ length: 10 }),
  rejectedReason: text({ length: 500 }),
}, (table) => ([
  index('applicant_app_id_idx').on(table.applicationId),
  index('applicant_user_id_idx').on(table.userId),
  index('applicant_app_created_idx').on(table.applicationId, table.createdAt),
  uniqueIndex('applicant_app_email_unique_idx').on(table.applicationId, table.email),
]));

export type Applicant = InferSelectModel<typeof applicantTable>;
