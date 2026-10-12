import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { agencyTable } from "./agency-workspace";
import { userTable } from "./user";

export interface AgencyInvitationEmailRequest {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
  tags: { name: string; value: string }[];
}

export const agencyInvitationTable = pgTable(
  "agency_invitation",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `ainv_${createId()}`)
      .notNull(),
    agencyId: text()
      .notNull()
      .references(() => agencyTable.id, { onDelete: "cascade" }),
    codeHash: text().notNull().unique(),
    recipientEmail: text(),
    createdById: text().references(() => userTable.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).notNull(),
    redeemedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    redeemedById: text().references(() => userTable.id, { onDelete: "set null" }),
    revokedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    deliveryStatus: text().notNull().default("not_sent"),
    deliveryAttempts: integer().notNull().default(0),
    deliveryKey: text(),
    deliveryRequest: jsonb().$type<AgencyInvitationEmailRequest>(),
    deliveryStartedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    sentAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    providerMessageId: text(),
    lastDeliveryError: text(),
  },
  (table) => [
    index("agency_invitation_agency_idx").on(table.agencyId),
    index("agency_invitation_expiry_idx").on(table.expiresAt),
  ],
);
