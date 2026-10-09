"use server";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { enterpriseInquiryTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/utils/auth";
import { withRateLimit } from "@/infra/with-rate-limit";

export const submitEnterpriseInquiryAction = createServerAction()
  .input(
    z.object({
      name: z.string().min(2, "Name is required"),
      email: z.string().email("Valid email required"),
      company: z.string().min(2, "Company name is required"),
      website: z
        .string()
        .url("Please enter a valid URL (include https://)")
        .optional()
        .or(z.literal("")),
      role: z.string().optional(),
      teamSize: z.string().optional(),
      monthlyVolume: z.string().optional(),
      message: z.string().max(3000).optional(),
    }),
  )
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        const db = getDB();
        const [inquiry] = await db
          .insert(enterpriseInquiryTable)
          .values({
            name: input.name.trim(),
            email: input.email.trim().toLowerCase(),
            company: input.company.trim(),
            website: input.website?.trim() || null,
            role: input.role?.trim() || null,
            teamSize: input.teamSize || null,
            monthlyVolume: input.monthlyVolume || null,
            message: input.message?.trim() || null,
          })
          .returning();

        return { id: inquiry.id };
      },
      {
        identifier: "enterprise-inquiry",
        limit: 5,
        windowInSeconds: 60 * 60,
      },
    );
  });

export const updateEnterpriseInquiryStatusAction = createServerAction()
  .input(
    z.object({
      id: z.string().min(1),
      status: z.enum(["new", "contacted", "closed"]),
      adminNote: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ input }) => {
    const session = await requireAdmin({ doNotThrowError: true });
    if (!session)
      throw new ZSAError("NOT_AUTHORIZED", "You must be an admin to perform this action");

    const db = getDB();
    const [updated] = await db
      .update(enterpriseInquiryTable)
      .set({
        status: input.status,
        adminNote: input.adminNote ?? null,
      })
      .where(eq(enterpriseInquiryTable.id, input.id))
      .returning();

    return updated;
  });
