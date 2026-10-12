"use server";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDB } from "@/db";
import { validateCsrfToken } from "@/infra/csrf";
import { requireAgencyStaff } from "@/server/agency-team";
import { requireApplicationPermission } from "@/utils/application-auth";
import { createCollectionRequest } from "@/server/collection-requests";

export const createCollectionRequestAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      csrfToken: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "The security token expired. Reload the page and try again.");
    const { session, staff } = await requireAgencyStaff();
    await requireApplicationPermission(input.applicationId, "access_application");
    const report = await createCollectionRequest({
      db: getDB(),
      agencyId: staff.agencyId,
      userId: session.userId,
      ...input,
    });
    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard/reports");
    return report;
  });
