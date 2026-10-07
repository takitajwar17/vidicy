import { pgTable, integer, text, index, uniqueIndex, timestamp, jsonb } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";

// Application membership table
export const applicationMembershipTable = pgTable("application_membership", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `amem_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  invitedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
  invitedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  joinedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  expiresAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  isActive: integer().default(1).notNull(),
}, (table) => ([
  index('app_membership_app_id_idx').on(table.applicationId),
  index('app_membership_user_id_idx').on(table.userId),
  uniqueIndex('app_membership_unique_idx').on(table.applicationId, table.userId),
]));

// Application role table
export const applicationRoleTable = pgTable("application_role", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `arole_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  // Store permissions as a JSON array of permission keys
  permissions: jsonb().notNull().$type<string[]>(),
  // A JSON field for storing UI-specific settings like color, icon, etc.
  metadata: text(),
  // Optional flag to mark some roles as non-editable
  isEditable: integer().default(1).notNull(),
}, (table) => ([
  index('app_role_app_id_idx').on(table.applicationId),
  uniqueIndex('app_role_name_unique_idx').on(table.applicationId, table.name),
]));

// Application invitation table
export const applicationInvitationTable = pgTable("application_invitation", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `ainv_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  token: text().notNull().unique(),
  invitedBy: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  expiresAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }).notNull(),
  acceptedAt: timestamp({ withTimezone: true, mode: "date", precision: 3 }),
  acceptedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
}, (table) => ([
  index('app_invitation_app_id_idx').on(table.applicationId),
  index('app_invitation_email_idx').on(table.email),
  index('app_invitation_token_idx').on(table.token),
]));

export type ApplicationMembership = InferSelectModel<typeof applicationMembershipTable>;
export type ApplicationRole = InferSelectModel<typeof applicationRoleTable>;
export type ApplicationInvitation = InferSelectModel<typeof applicationInvitationTable>;
