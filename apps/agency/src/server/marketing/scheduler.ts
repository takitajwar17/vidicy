import { logger } from "@/infra/logger";
import { runPhotoToolGuidanceRefreshPass } from "./photo-tools-refresh";

interface SchedulerEnv {
  APP_KV?: KVNamespace;
}

export async function runMarketingScheduler({
  env,
  now = new Date(),
}: {
  env: SchedulerEnv;
  now?: Date;
}) {
  try {
    const photoToolSummary = await runPhotoToolGuidanceRefreshPass({ env, now });
    logger.info("Photo tool guidance refresh pass completed", {
      ranAt: now.toISOString(),
      refreshed: photoToolSummary.refreshed,
      skippedFresh: photoToolSummary.skippedFresh,
      skippedAttemptGuard: photoToolSummary.skippedAttemptGuard,
      failed: photoToolSummary.failed,
    });
  } catch (error) {
    logger.warn("Photo tool guidance refresh pass crashed", {
      ranAt: now.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
