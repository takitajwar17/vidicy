import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as schema from "./schema";
import { isSqlQueryLoggingEnabled } from "./db-logging";
import { drizzleWithInsertRecovery } from "./d1-driver";

export const PRIMARY_D1_BINDING_NAME = "APP_D1" as const;

function createDatabase(database: D1Database) {
  const logger = isSqlQueryLoggingEnabled(process.env.NODE_ENV, process.env.DB_SQL_LOG);

  return drizzleWithInsertRecovery(database, { schema, logger });
}

export function getDBFromDatabase(database: D1Database) {
  return createDatabase(database);
}

export const getDB = cache(() => {
  const { env } = getCloudflareContext();
  // `APP_D1` is injected by the checked-in worker entry. Plain local runtimes can
  // still expose the original OpenNext binding directly.
  const database = env[PRIMARY_D1_BINDING_NAME] ?? env.NEXT_TAG_CACHE_D1;

  if (!database) {
    throw new Error(`Missing required Cloudflare D1 binding: ${PRIMARY_D1_BINDING_NAME}`);
  }

  return createDatabase(database);
});
