import { pgTable, text, index, timestamp } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";

export const ROLES_ENUM = {
  ADMIN: "admin",
  USER: "user",
} as const;

const roleTuple = Object.values(ROLES_ENUM) as [string, ...string[]];

export const userTable = pgTable(
  "user",
  {
    ...commonColumns,
    id: text()
      .primaryKey()
      .$defaultFn(() => `usr_${createId()}`)
      .notNull(),
    firstName: text(),
    lastName: text(),
    email: text().unique(),
    passwordHash: text(),
    role: text({
      enum: roleTuple,
    })
      .default(ROLES_ENUM.USER)
      .notNull(),
    emailVerified: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
    signUpIpAddress: text(),
    googleAccountId: text(),
    /**
     * This can either be an absolute or relative path to an image
     */
    avatar: text(),
  },
  (table) => [
    index("email_idx").on(table.email),
    index("google_account_id_idx").on(table.googleAccountId),
    index("role_idx").on(table.role),
  ],
);

export type User = InferSelectModel<typeof userTable>;
