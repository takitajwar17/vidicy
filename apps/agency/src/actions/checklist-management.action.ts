"use server";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDB } from "@/db";
import { validateCsrfToken } from "@/infra/csrf";
import { checklistMutationSchema } from "@/lib/checklist-input";
import { requireAgencyStaff } from "@/server/agency-team";
import { requireApplicationPermission } from "@/utils/application-auth";
import { mutateChecklistItem } from "@/server/checklist-management";

export const mutateChecklistItemAction = createServerAction()
  .input(z.object({ csrfToken: z.string().min(1), mutation: checklistMutationSchema }))
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "The security token expired. Reload the page and try again.");
    const { staff } = await requireAgencyStaff();
    await requireApplicationPermission(input.mutation.applicationId, "access_application");
    const result = await mutateChecklistItem({
      db: getDB(),
      agencyId: staff.agencyId,
      input: input.mutation,
    });
    revalidatePath(`/dashboard/${input.mutation.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/reports");
    return result;
  });
