import "server-only";

import { like, sql } from "drizzle-orm";

import { PAGE_SIZE_OPTIONS } from "@/app/(admin)/admin/admin-constants";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { requireAdmin } from "@/utils/auth";

export interface AdminUsersPageInput {
  emailFilter?: string;
  page?: number;
  pageSize?: number;
}

export async function getAdminUsersPage({
  emailFilter = "",
  page = 1,
  pageSize = PAGE_SIZE_OPTIONS[0],
}: AdminUsersPageInput = {}) {
  await requireAdmin();

  const db = getDB();
  const safePage = Math.max(page, 1);
  const safePageSize = PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : PAGE_SIZE_OPTIONS[0];
  const offset = (safePage - 1) * safePageSize;
  const normalizedEmailFilter = emailFilter.trim();
  const whereClause = normalizedEmailFilter
    ? like(userTable.email, `%${normalizedEmailFilter.replace(/[%_\\]/g, "\\$&")}%`)
    : undefined;

  const [[{ count }], users] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(userTable)
      .where(whereClause),
    db.query.userTable.findMany({
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
      where: whereClause,
      orderBy: (usersTable, { desc }) => [desc(usersTable.createdAt)],
      limit: safePageSize,
      offset,
    }),
  ]);

  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null,
      role: user.role,
      status: user.emailVerified ? ("active" as const) : ("inactive" as const),
      createdAt: user.createdAt,
    })),
    totalCount: Number(count ?? 0),
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(Number(count ?? 0) / safePageSize),
  };
}
