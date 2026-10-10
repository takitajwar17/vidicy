import { pgTable, text, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";

export const agencyTable = pgTable(
  "agency",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `agy_${createId()}`)
      .notNull(),
    ownerUserId: text()
      .unique()
      .references(() => userTable.id, { onDelete: "set null" }),
    name: text().notNull(),
  },
  (table) => [index("agency_owner_idx").on(table.ownerUserId)],
);
