import { integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const commonColumns = {
  createdAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).$onUpdateFn(() => new Date()).notNull(),
  updateCounter: integer().default(0).$onUpdate(() => sql`"updateCounter" + 1`),
};
