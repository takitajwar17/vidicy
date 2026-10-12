"use server";

import { createServerAction } from "zsa";
import { z } from "zod";
import { requireApplicationPermission } from "@/utils/application-auth";
import { APPLICATION_PERMISSIONS } from "@/db/schema";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";
import { requestChecklistJob, getLatestChecklistJob } from "@/server/checklist-jobs";

const identity = z.object({ applicationId: z.string().min(1), applicantId: z.string().min(1) });

export const generateChecklistAction = createServerAction()
  .input(identity.extend({ refreshResearch: z.boolean().optional() }))
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    await checkActionRateLimit("generateChecklist", session.userId, 5);
    const job = await requestChecklistJob({ ...input, userId: session.userId });
    trackUsage({
      userId: session.userId,
      event: USAGE_EVENTS.CHECKLIST_GENERATED,
      metadata: { applicationId: input.applicationId },
    });
    return job;
  });

export const getChecklistJobAction = createServerAction()
  .input(identity)
  .handler(async ({ input }) => {
    await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    return getLatestChecklistJob(input);
  });
