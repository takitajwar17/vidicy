import { logger } from "@/infra/logger";
import { getDBFromDatabase } from "@/db";

import { type MarketingRuntimeEnv } from "./resend";
import { processDueLifecycleEnrollments, syncEnrollmentsFromEvents } from "./enrollment";
import { runPhotoToolGuidanceRefreshPass } from "./photo-tools-refresh";

interface SchedulerEnv extends MarketingRuntimeEnv {
  APP_D1: D1Database;
  APP_KV?: KVNamespace;
}

export async function runMarketingLifecyclePass({
  db,
  env,
  now = new Date(),
}: {
  db: ReturnType<typeof getDBFromDatabase>;
  env?: MarketingRuntimeEnv;
  now?: Date;
}) {
  await syncEnrollmentsFromEvents(db);
  await processDueLifecycleEnrollments(db, env, now);
}

export async function runMarketingScheduler({
  env,
  now = new Date(),
}: {
  env: SchedulerEnv;
  now?: Date;
}) {
  const db = getDBFromDatabase(env.APP_D1);

  await runMarketingLifecyclePass({ db, env, now });

  logger.info("Marketing lifecycle scheduler run completed", {
    ranAt: now.toISOString(),
  });

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
