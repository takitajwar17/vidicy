import { sqliteTable, integer, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { commonColumns } from "./_common";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";

// Application membership table
export const applicationMembershipTable = sqliteTable("application_membership", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `amem_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  invitedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
  invitedAt: integer({ mode: "timestamp" }),
  joinedAt: integer({ mode: "timestamp" }),
  expiresAt: integer({ mode: "timestamp" }),
  isActive: integer().default(1).notNull(),
}, (table) => ([
  index('app_membership_app_id_idx').on(table.applicationId),
  index('app_membership_user_id_idx').on(table.userId),
  uniqueIndex('app_membership_unique_idx').on(table.applicationId, table.userId),
]));

// Application role table
export const applicationRoleTable = sqliteTable("application_role", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `arole_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  name: text({ length: 255 }).notNull(),
  description: text({ length: 1000 }),
  // Store permissions as a JSON array of permission keys
  permissions: text({ mode: 'json' }).notNull().$type<string[]>(),
  // A JSON field for storing UI-specific settings like color, icon, etc.
  metadata: text({ length: 5000 }),
  // Optional flag to mark some roles as non-editable
  isEditable: integer().default(1).notNull(),
}, (table) => ([
  index('app_role_app_id_idx').on(table.applicationId),
  uniqueIndex('app_role_name_unique_idx').on(table.applicationId, table.name),
]));

// Application invitation table
export const applicationInvitationTable = sqliteTable("application_invitation", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `ainv_${createId()}`).notNull(),
  applicationId: text().notNull().references(() => visaApplicationTable.id, { onDelete: 'cascade' }),
  email: text({ length: 255 }).notNull(),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  token: text({ length: 255 }).notNull().unique(),
  invitedBy: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  acceptedAt: integer({ mode: "timestamp" }),
  acceptedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
}, (table) => ([
  index('app_invitation_app_id_idx').on(table.applicationId),
  index('app_invitation_email_idx').on(table.email),
  index('app_invitation_token_idx').on(table.token),
]));

export type ApplicationMembership = InferSelectModel<typeof applicationMembershipTable>;
export type ApplicationRole = InferSelectModel<typeof applicationRoleTable>;
export type ApplicationInvitation = InferSelectModel<typeof applicationInvitationTable>;
