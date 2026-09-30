import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";
import { applicantTable } from "./applicant";
import { checklistItemTable } from "./checklist";
import { uploadedDocumentTable } from "./document";

export const AGENCY_STAFF_ROLE = {
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export const agencyStaffRoleTuple = Object.values(AGENCY_STAFF_ROLE) as [string, ...string[]];

export const AGENCY_STAFF_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
} as const;

export const agencyStaffStatusTuple = Object.values(AGENCY_STAFF_STATUS) as [string, ...string[]];

export const REVIEW_ISSUE_SEVERITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export const reviewIssueSeverityTuple = Object.values(REVIEW_ISSUE_SEVERITY) as [string, ...string[]];

export const REVIEW_ISSUE_STATUS = {
  OPEN: "open",
  CLIENT_REQUESTED: "client_requested",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
} as const;

export type ReviewIssueStatusValue = (typeof REVIEW_ISSUE_STATUS)[keyof typeof REVIEW_ISSUE_STATUS];

export const reviewIssueStatusTuple = [
  REVIEW_ISSUE_STATUS.OPEN,
  REVIEW_ISSUE_STATUS.CLIENT_REQUESTED,
  REVIEW_ISSUE_STATUS.RESOLVED,
  REVIEW_ISSUE_STATUS.DISMISSED,
] as [ReviewIssueStatusValue, ...ReviewIssueStatusValue[]];

export const REVIEW_ISSUE_STATUS_OPTIONS = reviewIssueStatusTuple;

export const REVIEW_ISSUE_SOURCE = {
  AI: "ai",
  REVIEWER: "reviewer",
  SYSTEM: "system",
} as const;

export const reviewIssueSourceTuple = Object.values(REVIEW_ISSUE_SOURCE) as [string, ...string[]];

export const CLIENT_REPORT_DELIVERY_STATUS = {
  DRAFT: "draft",
  READY: "ready",
  SENT: "sent",
} as const;

export const clientReportDeliveryStatusTuple = Object.values(CLIENT_REPORT_DELIVERY_STATUS) as [
  string,
  ...string[],
];

export interface ClientReportActionItem {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

export const agencyTeamMemberTable = sqliteTable(
  "agency_team_member",
	{
	  ...commonColumns,
	  id: text().primaryKey().$defaultFn(() => `atm_${createId()}`).notNull(),
	  userId: text().references(() => userTable.id, { onDelete: "set null" }),
	  email: text({ length: 255 }),
	  role: text({ enum: agencyStaffRoleTuple }).default(AGENCY_STAFF_ROLE.MEMBER).notNull(),
	  status: text({ enum: agencyStaffStatusTuple }).default(AGENCY_STAFF_STATUS.ACTIVE).notNull(),
	  invitedBy: text().references(() => userTable.id, { onDelete: "set null" }),
    invitedAt: integer({ mode: "timestamp" }),
    joinedAt: integer({ mode: "timestamp" }),
	},
	(table) => [
	  uniqueIndex("agency_team_member_user_unique_idx").on(table.userId),
	  uniqueIndex("agency_team_member_email_unique_idx").on(table.email),
	  index("agency_team_member_email_idx").on(table.email),
	  index("agency_team_member_role_idx").on(table.role),
	  index("agency_team_member_status_idx").on(table.status),
	],
  );

export const agencyClientTable = sqliteTable(
  "agency_client",
  {
    ...commonColumns,
    id: text().primaryKey().$defaultFn(() => `acl_${createId()}`).notNull(),
    name: text({ length: 255 }).notNull(),
    email: text({ length: 255 }),
    phone: text({ length: 100 }),
    companyName: text({ length: 255 }),
    country: text({ length: 100 }),
    notes: text({ length: 2000 }),
  },
  (table) => [
    index("agency_client_name_idx").on(table.name),
    index("agency_client_email_idx").on(table.email),
  ],
);

export const reviewIssueTable = sqliteTable(
  "review_issue",
  {
    ...commonColumns,
    id: text().primaryKey().$defaultFn(() => `rissue_${createId()}`).notNull(),
    applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    applicantId: text().references(() => applicantTable.id, { onDelete: "cascade" }),
    checklistItemId: text().references(() => checklistItemTable.id, { onDelete: "set null" }),
    documentId: text().references(() => uploadedDocumentTable.id, { onDelete: "set null" }),
    title: text({ length: 255 }).notNull(),
    description: text({ length: 2000 }).notNull(),
    recommendation: text({ length: 2000 }),
    category: text({ length: 100 }).notNull().default("document"),
    severity: text({ enum: reviewIssueSeverityTuple }).default(REVIEW_ISSUE_SEVERITY.MEDIUM).notNull(),
    status: text({ enum: reviewIssueStatusTuple }).default(REVIEW_ISSUE_STATUS.OPEN).notNull(),
    source: text({ enum: reviewIssueSourceTuple }).default(REVIEW_ISSUE_SOURCE.REVIEWER).notNull(),
    confidence: integer(),
    clientVisible: integer({ mode: "boolean" }).default(true).notNull(),
    assignedToId: text().references(() => userTable.id, { onDelete: "set null" }),
    createdById: text().references(() => userTable.id, { onDelete: "set null" }),
    resolvedAt: integer({ mode: "timestamp" }),
  },
  (table) => [
    index("review_issue_app_id_idx").on(table.applicationId),
    index("review_issue_app_status_idx").on(table.applicationId, table.status),
    index("review_issue_app_severity_idx").on(table.applicationId, table.severity),
    index("review_issue_assigned_to_idx").on(table.assignedToId),
    index("review_issue_checklist_item_idx").on(table.checklistItemId),
  ],
);

export const clientReportTable = sqliteTable(
  "client_report",
  {
    ...commonColumns,
    id: text().primaryKey().$defaultFn(() => `crep_${createId()}`).notNull(),
    applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    status: text({ enum: clientReportDeliveryStatusTuple }).default(CLIENT_REPORT_DELIVERY_STATUS.DRAFT).notNull(),
    summary: text({ length: 4000 }).notNull(),
    actionItems: text({ mode: "json" }).notNull().$type<ClientReportActionItem[]>(),
    createdById: text().references(() => userTable.id, { onDelete: "set null" }),
    sentAt: integer({ mode: "timestamp" }),
  },
  (table) => [
    index("client_report_app_id_idx").on(table.applicationId),
    index("client_report_status_idx").on(table.status),
  ],
);

export type AgencyTeamMember = InferSelectModel<typeof agencyTeamMemberTable>;
export type AgencyClient = InferSelectModel<typeof agencyClientTable>;
export type ReviewIssue = InferSelectModel<typeof reviewIssueTable>;
export type ClientReport = InferSelectModel<typeof clientReportTable>;
