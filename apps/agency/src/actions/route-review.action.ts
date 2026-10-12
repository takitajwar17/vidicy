"use server";

import { createServerAction, ZSAError } from "zsa";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDB } from "@/db";
import { validateCsrfToken } from "@/infra/csrf";
import { routeReviewInputSchema } from "@/lib/route-review-input";
import { requireAgencyStaff } from "@/server/agency-team";
import { saveRouteReviewSettings } from "@/server/route-review-settings";
import { requireApplicationPermission } from "@/utils/application-auth";

export const saveRouteReviewAction = createServerAction()
  .input(routeReviewInputSchema.extend({ csrfToken: z.string().min(1) }))
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "The security token expired. Reload the page and try again.");
    const { staff } = await requireAgencyStaff();
    await requireApplicationPermission(input.applicationId, "access_application");
    const result = await saveRouteReviewSettings({ db: getDB(), agencyId: staff.agencyId, input });
    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/reports");
    return result;
  });
