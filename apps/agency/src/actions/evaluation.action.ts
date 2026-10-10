"use server";

import { createServerAction } from "zsa";
import { z } from "zod";
import { requireApplicationPermission } from "@/utils/application-auth";
import { APPLICATION_PERMISSIONS } from "@/db/schema";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { requestReviewJob, getLatestReviewJob } from "@/server/review-jobs";

const schema = z.object({ applicationId: z.string().min(1), applicantId: z.string().min(1) });

export const evaluateDocumentsAction = createServerAction()
  .input(schema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    await checkActionRateLimit("evaluateDocuments", session.userId, 10);
    const job = await requestReviewJob({ ...input, userId: session.userId });
    trackUsage({
      userId: session.userId,
      event: USAGE_EVENTS.EVALUATION_RUN,
      metadata: { applicationId: input.applicationId },
    });
    return job;
  });

export const getReviewJobAction = createServerAction()
  .input(schema)
  .handler(async ({ input }) => {
    await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    return getLatestReviewJob(input);
  });
