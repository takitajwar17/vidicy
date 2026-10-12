"use server";

import { revalidatePath } from "next/cache";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { validateCsrfToken } from "@/infra/csrf";
import { withRateLimit, RATE_LIMITS } from "@/infra/with-rate-limit";
import { requireAgencyAdmin } from "@/server/agency-team";
import {
  createAgencyInvitation,
  resendAgencyInvitation,
  revokeAgencyInvitation,
} from "@/server/agency-invitations";

async function requireInvitationMutation(csrfToken: string) {
  if (!(await validateCsrfToken(csrfToken)))
    throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
  return requireAgencyAdmin();
}

const invitationIdSchema = z.object({
  invitationId: z.string().min(1),
  csrfToken: z.string().min(1),
});

export const createAgencyInvitationAction = createServerAction()
  .input(
    z.object({
      email: z.string().trim().email().optional().or(z.literal("")),
      csrfToken: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    const { session } = await requireInvitationMutation(input.csrfToken);
    return withRateLimit(
      async () => {
        const result = await createAgencyInvitation({ email: input.email || undefined });
        revalidatePath("/settings/agency");
        return result;
      },
      {
        ...RATE_LIMITS.TEAM_INVITE,
        identifier: "agency-invitation-create",
        userIdentifier: session.userId,
      },
    );
  });

export const resendAgencyInvitationAction = createServerAction()
  .input(invitationIdSchema)
  .handler(async ({ input }) => {
    const { session } = await requireInvitationMutation(input.csrfToken);
    return withRateLimit(
      async () => {
        const result = await resendAgencyInvitation({ invitationId: input.invitationId });
        revalidatePath("/settings/agency");
        return result;
      },
      {
        ...RATE_LIMITS.EMAIL,
        identifier: "agency-invitation-resend",
        userIdentifier: session.userId,
      },
    );
  });

export const revokeAgencyInvitationAction = createServerAction()
  .input(invitationIdSchema)
  .handler(async ({ input }) => {
    const { session } = await requireInvitationMutation(input.csrfToken);
    return withRateLimit(
      async () => {
        const result = await revokeAgencyInvitation({ invitationId: input.invitationId });
        revalidatePath("/settings/agency");
        return result;
      },
      {
        ...RATE_LIMITS.SETTINGS,
        identifier: "agency-invitation-revoke",
        userIdentifier: session.userId,
      },
    );
  });
