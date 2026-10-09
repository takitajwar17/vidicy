import { pgTable, text, index } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";

export const ENTERPRISE_INQUIRY_STATUS = {
  NEW: "new",
  CONTACTED: "contacted",
  CLOSED: "closed",
} as const;

export const enterpriseInquiryStatusTuple = Object.values(ENTERPRISE_INQUIRY_STATUS) as [
  string,
  ...string[],
];

export const enterpriseInquiryTable = pgTable(
  "enterprise_inquiry",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `ent_${createId()}`)
      .notNull(),
    name: text().notNull(),
    email: text().notNull(),
    company: text().notNull(),
    role: text(),
    teamSize: text(),
    monthlyVolume: text(),
    website: text(),
    message: text(),
    status: text({ enum: enterpriseInquiryStatusTuple })
      .default(ENTERPRISE_INQUIRY_STATUS.NEW)
      .notNull(),
    adminNote: text(),
  },
  (table) => [
    index("enterprise_inquiry_email_idx").on(table.email),
    index("enterprise_inquiry_status_idx").on(table.status),
  ],
);

export type EnterpriseInquiry = InferSelectModel<typeof enterpriseInquiryTable>;
