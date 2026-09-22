import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { visaApplicationTable } from "./visa-application";
import { applicantTable } from "./applicant";

// Checklist Item Status
export const CHECKLIST_ITEM_STATUS = {
  PENDING: 'pending',
  UPLOADED: 'uploaded',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const checklistItemStatusTuple = Object.values(CHECKLIST_ITEM_STATUS) as [string, ...string[]];

// Checklist item table
export const checklistItemTable = sqliteTable("checklist_item", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `citem_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  applicantId: text().references(() => applicantTable.id, { onDelete: 'cascade' }),
  documentName: text({ length: 255 }).notNull(),
  description: text({ length: 1000 }).notNull(),
  commonMistakes: text({ length: 1000 }),
  isRequired: integer({ mode: "boolean" }).default(true).notNull(),
  status: text({ enum: checklistItemStatusTuple }).default(CHECKLIST_ITEM_STATUS.PENDING).notNull(),
  sortOrder: integer().default(0).notNull(),
}, (table) => ([
  index('checklist_item_app_id_idx').on(table.applicationId),
  index('checklist_item_applicant_id_idx').on(table.applicantId),
  index('checklist_item_status_idx').on(table.status),
  // Composite: checklist queries always filter by (applicationId, applicantId)
  index('checklist_item_app_applicant_idx').on(table.applicationId, table.applicantId),
  index('checklist_item_app_applicant_sort_idx').on(
    table.applicationId,
    table.applicantId,
    table.sortOrder,
  ),
]));

export type ChecklistItem = InferSelectModel<typeof checklistItemTable>;
