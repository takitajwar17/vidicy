import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";
import { isSqlQueryLoggingEnabled } from "./db-logging";
import { drizzleWithInsertRecovery } from "./d1-driver";
import * as legacyD1Schema from "./legacy-d1-schema";

interface ExecutableBatchQuery extends BatchItem<"pg"> {
  execute(): Promise<unknown>;
}

function createDatabase(pool: Pool) {
  const batchClient = new AsyncLocalStorage<PoolClient>();
  // Route the public node-postgres query call, rather than rebuilding prepared
  // SQL or mapping raw rows ourselves. Drizzle retains its native RETURNING,
  // relational-query, JSON, timestamp and nullable-join result mapping.
  const client = new Proxy(pool, {
    get(target, property, receiver) {
      if (property === "query") {
        const connection = batchClient.getStore() ?? target;
        return connection.query.bind(connection);
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const database = drizzle(client, {
    schema,
    logger: isSqlQueryLoggingEnabled(process.env.NODE_ENV, process.env.DB_SQL_LOG),
  });

  async function withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    if (batchClient.getStore()) throw new Error("Nested database transactions are not supported");
    const connection = await pool.connect();
    let isReleased = false;
    try {
      await connection.query("BEGIN");
      const result = await batchClient.run(connection, operation);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        // Discard a broken connection; preserve the original query error.
        connection.release(true);
        isReleased = true;
      }
      throw error;
    } finally {
      if (!isReleased) connection.release();
    }
  }

  async function batch<const T extends readonly BatchItem<"pg">[]>(queries: T): Promise<BatchResponse<T>> {
    return withTransaction(async () => {
      const values: unknown[] = [];
      for (const query of queries) {
        // Execute the original query so Drizzle evaluates defaults only once.
        const executable = query as ExecutableBatchQuery;
        if (typeof executable.execute !== "function") {
          throw new Error("Database batch requires executable Drizzle queries");
        }
        values.push(await executable.execute());
      }
      return values as BatchResponse<T>;
    });
  }

  return Object.assign(database, { batch, withTransaction });
}

// Retain the explicit legacy injection helper for D1 migration tools and old
// fixtures. Production getDB never selects this adapter or its SQLite schema.
function createLegacyD1Database(database: D1Database) {
  return drizzleWithInsertRecovery(database, {
    schema: legacyD1Schema,
    logger: isSqlQueryLoggingEnabled(process.env.NODE_ENV, process.env.DB_SQL_LOG),
  });
}

export function getDBFromDatabase(database: Pool): ReturnType<typeof createDatabase>;
export function getDBFromDatabase(database: D1Database): ReturnType<typeof createLegacyD1Database>;
export function getDBFromDatabase(database: Pool | D1Database) {
  return database instanceof Pool ? createDatabase(database) : createLegacyD1Database(database);
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDB() {
  if (!database) {
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
      throw new Error("Set DATABASE_URL or PGHOST, PGDATABASE, PGUSER and PGPASSWORD");
    }
    const pool = new Pool({
      ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
      // pg reads PGHOST, PGDATABASE, PGUSER and PGPASSWORD when no URL is set.
      // A Cloud SQL Unix socket uses PGHOST=/cloudsql/project:region:instance.
      max: Number(process.env.PGPOOL_MAX ?? 5),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", () => {
      // Do not log connection strings or credentials from driver error details.
      console.error("An idle PostgreSQL connection failed");
    });
    database = createDatabase(pool);
  }
  return database;
}
