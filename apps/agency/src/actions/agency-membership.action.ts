"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { validateCsrfToken } from "@/infra/csrf";
import {
  createAgency,
  previewAgencyInvite,
  joinAgency,
  leaveAgency,
  transferAgencyOwnership,
  updateAgencySettings,
  deleteEmptyAgency,
} from "@/server/agency-membership";

const csrf = z.object({ csrfToken: z.string().min(1) });
async function checkCsrf(token: string) {
  if (!(await validateCsrfToken(token)))
    throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
}
function refreshAgencyPages() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/agency");
  revalidatePath("/agency-setup");
}

export const createAgencyAction = createServerAction()
  .input(csrf.extend({ name: z.string().trim().min(1).max(120) }))
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await createAgency(input);
    refreshAgencyPages();
    return result;
  });
export const previewAgencyInviteAction = createServerAction()
  .input(csrf.extend({ code: z.string().min(1).max(100) }))
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    return previewAgencyInvite(input);
  });
export const joinAgencyAction = createServerAction()
  .input(csrf.extend({ code: z.string().min(1).max(100) }))
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await joinAgency(input);
    refreshAgencyPages();
    return result;
  });
export const leaveAgencyAction = createServerAction()
  .input(csrf)
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await leaveAgency();
    refreshAgencyPages();
    return result;
  });
export const transferAgencyOwnershipAction = createServerAction()
  .input(csrf.extend({ memberId: z.string().min(1) }))
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await transferAgencyOwnership(input);
    refreshAgencyPages();
    return result;
  });
export const updateAgencySettingsAction = createServerAction()
  .input(csrf.extend({ name: z.string().trim().min(1).max(120) }))
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await updateAgencySettings(input);
    refreshAgencyPages();
    return result;
  });
export const deleteEmptyAgencyAction = createServerAction()
  .input(csrf)
  .handler(async ({ input }) => {
    await checkCsrf(input.csrfToken);
    const result = await deleteEmptyAgency();
    refreshAgencyPages();
    return result;
  });
