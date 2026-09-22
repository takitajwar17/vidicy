import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";

export const ENTERPRISE_INQUIRY_STATUS = {
  NEW: "new",
  CONTACTED: "contacted",
  CLOSED: "closed",
} as const;

export const enterpriseInquiryStatusTuple = Object.values(ENTERPRISE_INQUIRY_STATUS) as [string, ...string[]];

export const enterpriseInquiryTable = sqliteTable("enterprise_inquiry", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `ent_${createId()}`).notNull(),
  name: text({ length: 255 }).notNull(),
  email: text({ length: 255 }).notNull(),
  company: text({ length: 255 }).notNull(),
  role: text({ length: 255 }),
  teamSize: text({ length: 50 }),
  monthlyVolume: text({ length: 50 }),
  website: text({ length: 500 }),
  message: text({ length: 3000 }),
  status: text({ enum: enterpriseInquiryStatusTuple }).default(ENTERPRISE_INQUIRY_STATUS.NEW).notNull(),
  adminNote: text({ length: 2000 }),
}, (table) => ([
  index("enterprise_inquiry_email_idx").on(table.email),
  index("enterprise_inquiry_status_idx").on(table.status),
]));

export type EnterpriseInquiry = InferSelectModel<typeof enterpriseInquiryTable>;
