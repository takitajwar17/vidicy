import { NoopCache, type Cache } from "drizzle-orm/cache/core";
import { Column } from "drizzle-orm/column";
import { type SQLiteD1SessionOptions } from "drizzle-orm/d1/session";
import { DrizzleD1Database } from "drizzle-orm/d1/driver";
import { is } from "drizzle-orm/entity";
import { DefaultLogger, NoopLogger, type Logger } from "drizzle-orm/logger";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type RelationalSchemaConfig,
  type TablesRelationalConfig,
} from "drizzle-orm/relations";
import {
  SQL,
  fillPlaceholders,
  sql,
  type DriverValueDecoder,
  type Query,
} from "drizzle-orm/sql/sql";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core/dialect";
import type { SelectedFieldsOrdered } from "drizzle-orm/sqlite-core/query-builders/select.types";
import {
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteTransaction,
  type PreparedQueryConfig,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from "drizzle-orm/sqlite-core/session";
import { type WithCacheConfig } from "drizzle-orm/cache/core/types";
import { getTableName } from "drizzle-orm/table";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { isRetryableD1WriteError, isUniqueConstraintError } from "@/infra/d1-retry";
import { logger } from "@/infra/logger";

interface TableRecoveryMetadata {
  primaryKeyColumnName: string;
}

type CacheWithInvalidate = Cache & {
  invalidate: Cache["onMutate"];
};

interface InsertRecoveryContext {
  primaryKeyValues: unknown[];
  returningClause: string | null;
  tableName: string;
}

interface InsertRecoveryLookupQuery {
  queryParams: unknown[];
  querySql: string;
}

type InsertQueryMetadata = {
  type: "insert" | "update" | "delete" | "select";
  tables: string[];
};

interface QueryWithCacheAccessor<TResult> {
  queryWithCache: (
    queryString: string,
    params: unknown[],
    execute: () => Promise<TResult>,
  ) => Promise<TResult>;
}

interface DecodableSql extends SQL<unknown> {
  decoder: DriverValueDecoder<unknown, unknown>;
}

interface AliasedFieldWithDecoder {
  sql: DecodableSql;
}

function buildTableRecoveryMetadataByName(tables: TablesRelationalConfig) {
  const tableMetadataByName = new Map<string, TableRecoveryMetadata>();

  for (const tableConfig of Object.values(tables)) {
    if (tableConfig.primaryKey.length !== 1) {
      continue;
    }

    const [primaryKeyColumn] = tableConfig.primaryKey;
    if (!primaryKeyColumn?.name) {
      continue;
    }

    tableMetadataByName.set(tableConfig.dbName, {
      primaryKeyColumnName: primaryKeyColumn.name,
    });
  }

  return tableMetadataByName;
}

function findMatchingParenthesis({
  sqlText,
  startIndex,
}: {
  sqlText: string;
  startIndex: number;
}) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = startIndex; index < sqlText.length; index += 1) {
    const currentChar = sqlText[index];
    const previousChar = index > 0 ? sqlText[index - 1] : "";

    if (currentChar === "'" && !inDoubleQuote && previousChar !== "\\") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (currentChar === '"' && !inSingleQuote && previousChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (currentChar === "(") {
      depth += 1;
      continue;
    }

    if (currentChar === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelCsv(csvText: string) {
  const entries: string[] = [];
  let currentEntry = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const currentChar = csvText[index];
    const previousChar = index > 0 ? csvText[index - 1] : "";

    if (currentChar === "'" && !inDoubleQuote && previousChar !== "\\") {
      inSingleQuote = !inSingleQuote;
      currentEntry += currentChar;
      continue;
    }

    if (currentChar === '"' && !inSingleQuote && previousChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      currentEntry += currentChar;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (currentChar === "(") {
        depth += 1;
      } else if (currentChar === ")") {
        depth -= 1;
      } else if (currentChar === "," && depth === 0) {
        entries.push(currentEntry.trim());
        currentEntry = "";
        continue;
      }
    }

    currentEntry += currentChar;
  }

  if (currentEntry.trim().length > 0) {
    entries.push(currentEntry.trim());
  }

  return entries;
}

function findTopLevelKeywordIndex({
  keyword,
  sqlText,
  startIndex,
}: {
  keyword: string;
  sqlText: string;
  startIndex: number;
}) {
  const lowercaseSql = sqlText.toLowerCase();
  const lowercaseKeyword = keyword.toLowerCase();
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = startIndex; index <= sqlText.length - lowercaseKeyword.length; index += 1) {
    const currentChar = sqlText[index];
    const previousChar = index > 0 ? sqlText[index - 1] : "";

    if (currentChar === "'" && !inDoubleQuote && previousChar !== "\\") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (currentChar === '"' && !inSingleQuote && previousChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (currentChar === "(") {
      depth += 1;
      continue;
    }

    if (currentChar === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && lowercaseSql.startsWith(lowercaseKeyword, index)) {
      return index;
    }
  }

  return -1;
}

function normalizeSqlIdentifier(identifier: string) {
  const trimmedIdentifier = identifier.trim();
  const withoutLeadingQuote =
    trimmedIdentifier.startsWith('"')
    || trimmedIdentifier.startsWith("`")
    || trimmedIdentifier.startsWith("[")
      ? trimmedIdentifier.slice(1)
      : trimmedIdentifier;

  return withoutLeadingQuote.endsWith('"')
    || withoutLeadingQuote.endsWith("`")
    || withoutLeadingQuote.endsWith("]")
    ? withoutLeadingQuote.slice(0, -1)
    : withoutLeadingQuote;
}

function extractValuesTuples(valuesSql: string) {
  const tuples: string[] = [];

  for (let index = 0; index < valuesSql.length; index += 1) {
    const currentChar = valuesSql[index];
    if (currentChar !== "(") {
      continue;
    }

    const endIndex = findMatchingParenthesis({
      sqlText: valuesSql,
      startIndex: index,
    });

    if (endIndex === -1) {
      return null;
    }

    tuples.push(valuesSql.slice(index + 1, endIndex));
    index = endIndex;
  }

  return tuples;
}

function escapeSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildOrderByCaseClause({
  primaryKeyColumnName,
  primaryKeyValues,
}: {
  primaryKeyColumnName: string;
  primaryKeyValues: unknown[];
}) {
  if (primaryKeyValues.length === 0) {
    return "";
  }

  const whenClauses = primaryKeyValues
    .map((_, index) => `when ? then ${index}`)
    .join(" ");

  return ` order by case ${escapeSqlIdentifier(primaryKeyColumnName)} ${whenClauses} end`;
}

function buildInsertRecoveryContext({
  queryMetadata,
  queryString,
  params,
  tableMetadataByName,
}: {
  queryMetadata: InsertQueryMetadata | undefined;
  queryString: string;
  params: unknown[];
  tableMetadataByName: Map<string, TableRecoveryMetadata>;
}): InsertRecoveryContext | null {
  if (queryMetadata?.type !== "insert" || queryMetadata.tables.length !== 1) {
    return null;
  }

  const tableName = queryMetadata.tables[0];
  const tableMetadata = tableMetadataByName.get(tableName);

  if (!tableMetadata) {
    return null;
  }

  const insertIntoIndex = queryString.toLowerCase().indexOf("insert into");
  if (insertIntoIndex === -1) {
    return null;
  }

  const columnsStartIndex = queryString.indexOf("(", insertIntoIndex);
  if (columnsStartIndex === -1) {
    return null;
  }

  const columnsEndIndex = findMatchingParenthesis({
    sqlText: queryString,
    startIndex: columnsStartIndex,
  });
  if (columnsEndIndex === -1) {
    return null;
  }

  const valuesKeywordIndex = queryString
    .toLowerCase()
    .indexOf(" values ", columnsEndIndex);
  if (valuesKeywordIndex === -1) {
    return null;
  }

  const valuesStartIndex = valuesKeywordIndex + " values ".length;
  const onConflictIndex = findTopLevelKeywordIndex({
    keyword: " on conflict ",
    sqlText: queryString,
    startIndex: valuesStartIndex,
  });
  const returningIndex = findTopLevelKeywordIndex({
    keyword: " returning ",
    sqlText: queryString,
    startIndex: valuesStartIndex,
  });

  const valuesEndIndexCandidates = [queryString.length];
  if (onConflictIndex !== -1) valuesEndIndexCandidates.push(onConflictIndex);
  if (returningIndex !== -1) valuesEndIndexCandidates.push(returningIndex);
  const valuesEndIndex = Math.min(...valuesEndIndexCandidates);

  const columnsSql = queryString.slice(columnsStartIndex + 1, columnsEndIndex);
  const valuesSql = queryString.slice(valuesStartIndex, valuesEndIndex);
  const returningClause =
    returningIndex === -1
      ? null
      : queryString.slice(returningIndex + " returning ".length).trim();

  const insertColumns = splitTopLevelCsv(columnsSql).map(normalizeSqlIdentifier);
  const tuples = extractValuesTuples(valuesSql);
  if (!tuples || tuples.length === 0) {
    return null;
  }

  const primaryKeyColumnIndex = insertColumns.indexOf(tableMetadata.primaryKeyColumnName);
  if (primaryKeyColumnIndex === -1) {
    return null;
  }

  const primaryKeyValues: unknown[] = [];
  let paramIndex = 0;

  for (const tuple of tuples) {
    const expressions = splitTopLevelCsv(tuple);
    if (expressions.length !== insertColumns.length) {
      return null;
    }

    let primaryKeyValue: unknown = undefined;

    for (const [expressionIndex, expression] of expressions.entries()) {
      const normalizedExpression = expression.trim();
      if (normalizedExpression === "?") {
        const currentParam = params[paramIndex];
        paramIndex += 1;

        if (expressionIndex === primaryKeyColumnIndex) {
          primaryKeyValue = currentParam;
        }
      } else if (expressionIndex === primaryKeyColumnIndex) {
        return null;
      }
    }

    if (primaryKeyValue == null) {
      return null;
    }

    primaryKeyValues.push(primaryKeyValue);
  }

  if (primaryKeyValues.length === 0) {
    return null;
  }

  return {
    tableName,
    primaryKeyValues,
    returningClause,
  };
}

function createRecoveredRunResponse({
  rowCount,
}: {
  rowCount: number;
}) {
  return ({
    success: true,
    results: [],
    meta: {
      changes: rowCount,
      changed_db: true,
      rows_read: rowCount,
      rows_written: rowCount,
    },
  } as unknown) as D1Response;
}

function buildInsertRecoveryLookupQuery({
  context,
  projectionSql,
  tableMetadataByName,
}: {
  context: InsertRecoveryContext;
  projectionSql: string;
  tableMetadataByName: Map<string, TableRecoveryMetadata>;
}): InsertRecoveryLookupQuery | null {
  const tableMetadata = tableMetadataByName.get(context.tableName);
  if (!tableMetadata) {
    return null;
  }

  const wherePlaceholders = context.primaryKeyValues.map(() => "?").join(", ");
  const orderByClause = buildOrderByCaseClause({
    primaryKeyColumnName: tableMetadata.primaryKeyColumnName,
    primaryKeyValues: context.primaryKeyValues,
  });

  return {
    querySql: `select ${projectionSql} from ${escapeSqlIdentifier(context.tableName)} where ${escapeSqlIdentifier(tableMetadata.primaryKeyColumnName)} in (${wherePlaceholders})${orderByClause}`,
    queryParams: [...context.primaryKeyValues, ...context.primaryKeyValues],
  };
}

function logRecoveredInsert({
  context,
}: {
  context: InsertRecoveryContext;
}) {
  logger.warn("Recovered ambiguous D1 insert by re-reading committed rows", {
    primaryKeyCount: context.primaryKeyValues.length,
    tableName: context.tableName,
  });
}

async function recoverInsertedRows({
  client,
  context,
  tableMetadataByName,
}: {
  client: D1Database;
  context: InsertRecoveryContext;
  tableMetadataByName: Map<string, TableRecoveryMetadata>;
}) {
  if (!context.returningClause) {
    return null;
  }

  const lookupQuery = buildInsertRecoveryLookupQuery({
    context,
    projectionSql: context.returningClause,
    tableMetadataByName,
  });
  if (!lookupQuery) {
    return null;
  }

  const recoveredRows = await client
    .prepare(lookupQuery.querySql)
    .bind(...lookupQuery.queryParams)
    .raw<unknown[]>();

  if (recoveredRows.length !== context.primaryKeyValues.length) {
    return null;
  }

  return recoveredRows;
}

async function canConfirmInsertedRows({
  client,
  context,
  tableMetadataByName,
}: {
  client: D1Database;
  context: InsertRecoveryContext;
  tableMetadataByName: Map<string, TableRecoveryMetadata>;
}) {
  const tableMetadata = tableMetadataByName.get(context.tableName);
  if (!tableMetadata) {
    return false;
  }

  const lookupQuery = buildInsertRecoveryLookupQuery({
    context,
    projectionSql: escapeSqlIdentifier(tableMetadata.primaryKeyColumnName),
    tableMetadataByName,
  });
  if (!lookupQuery) {
    return false;
  }

  const recoveredRows = await client
    .prepare(lookupQuery.querySql)
    .bind(...lookupQuery.queryParams)
    .all<Record<string, unknown>>();

  return recoveredRows.results.length === context.primaryKeyValues.length;
}

function d1ToRawMapping(results: Array<Record<string, unknown>>) {
  return results.map((row) => Object.keys(row).map((key) => row[key]));
}

function executeWithBaseQueryCache<TResult>({
  execute,
  params,
  preparedQuery,
  queryString,
}: {
  execute: () => Promise<TResult>;
  params: unknown[];
  preparedQuery: SQLitePreparedQuery<{
    type: "async";
    run: D1Response;
    all: unknown;
    get: unknown;
    values: unknown;
    execute: unknown;
  }>;
  queryString: string;
}) {
  return (preparedQuery as unknown as QueryWithCacheAccessor<TResult>)
    .queryWithCache(queryString, params, execute);
}

function getJoinsNotNullableMap(preparedQuery: unknown) {
  return (preparedQuery as {
    joinsNotNullableMap?: Record<string, boolean>;
  }).joinsNotNullableMap;
}

function mapResultRow(
  columns: SelectedFieldsOrdered,
  row: unknown[],
  joinsNotNullableMap: Record<string, boolean> | undefined,
) {
  const nullifyMap: Record<string, false | string> = {};
  const result = columns.reduce<Record<string, unknown>>((currentResult, { path, field }, columnIndex) => {
    let decoder: DriverValueDecoder<unknown, unknown>;
    if (is(field, Column)) {
      decoder = field;
    } else if (is(field, SQL)) {
      decoder = (field as DecodableSql).decoder;
    } else {
      decoder = (field as unknown as AliasedFieldWithDecoder).sql.decoder;
    }

    let node: Record<string, unknown> = currentResult;
    for (const [pathChunkIndex, pathChunk] of path.entries()) {
      if (pathChunkIndex < path.length - 1) {
        if (!(pathChunk in node)) {
          node[pathChunk] = {};
        }

        node = node[pathChunk] as Record<string, unknown>;
      } else {
        const rawValue = row[columnIndex];
        const value = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
        node[pathChunk] = value;

        if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
          const objectName = path[0];
          if (!(objectName in nullifyMap)) {
            nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
          } else if (
            typeof nullifyMap[objectName] === "string"
            && nullifyMap[objectName] !== getTableName(field.table)
          ) {
            nullifyMap[objectName] = false;
          }
        }
      }
    }

    return currentResult;
  }, {});

  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }

  return result;
}

class RecoveringD1PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<{
  type: "async";
  run: D1Response;
  all: T["all"];
  get: T["get"];
  values: T["values"];
  execute: T["execute"];
}> {
  private readonly client: D1Database;
  private readonly fields: SelectedFieldsOrdered | undefined;
  private readonly logger: Logger;
  private readonly insertQueryMetadata: InsertQueryMetadata | undefined;
  private readonly customResultMapper?: (rows: unknown[][]) => unknown;
  private readonly stmt: D1PreparedStatement;
  private readonly tableMetadataByName: Map<string, TableRecoveryMetadata>;
  private readonly _isResponseInArrayMode: boolean;

  constructor({
    cache,
    cacheConfig,
    client,
    customResultMapper,
    executeMethod,
    fields,
    isResponseInArrayMode,
    logger,
    query,
    queryMetadata,
    stmt,
    tableMetadataByName,
  }: {
    cache: Cache;
    cacheConfig: WithCacheConfig | undefined;
    client: D1Database;
    customResultMapper?: (rows: unknown[][]) => unknown;
    executeMethod: SQLiteExecuteMethod;
    fields: SelectedFieldsOrdered | undefined;
    isResponseInArrayMode: boolean;
    logger: Logger;
    query: Query;
    queryMetadata: InsertQueryMetadata | undefined;
    stmt: D1PreparedStatement;
    tableMetadataByName: Map<string, TableRecoveryMetadata>;
  }) {
    super("async", executeMethod, query, cache, queryMetadata, cacheConfig);
    this.client = client;
    this.customResultMapper = customResultMapper;
    this.fields = fields;
    this.logger = logger;
    this.insertQueryMetadata = queryMetadata;
    this.stmt = stmt;
    this.tableMetadataByName = tableMetadataByName;
    this._isResponseInArrayMode = isResponseInArrayMode;
  }

  private async executeInsertWithRecovery<TResult>({
    execute,
    params,
    queryString,
    recover,
  }: {
    execute: () => Promise<TResult>;
    params: unknown[];
    queryString: string;
    recover: (context: InsertRecoveryContext) => Promise<TResult | null>;
  }) {
    try {
      return await executeWithBaseQueryCache({
        execute,
        params,
        preparedQuery: this,
        queryString,
      });
    } catch (error) {
      if (!isRetryableD1WriteError({ error })) {
        throw error;
      }

      const recoveryContext = buildInsertRecoveryContext({
        queryMetadata: this.insertQueryMetadata,
        queryString,
        params,
        tableMetadataByName: this.tableMetadataByName,
      });
      if (!recoveryContext) {
        throw error;
      }

      const recoveredBeforeRetry = await recover(recoveryContext);
      if (recoveredBeforeRetry !== null) {
        logRecoveredInsert({
          context: recoveryContext,
        });
        return recoveredBeforeRetry;
      }

      try {
        return await executeWithBaseQueryCache({
          execute,
          params,
          preparedQuery: this,
          queryString,
        });
      } catch (retryError) {
        if (
          !isRetryableD1WriteError({ error: retryError })
          && !isUniqueConstraintError({ error: retryError })
        ) {
          throw retryError;
        }

        const recoveredAfterRetry = await recover(recoveryContext);
        if (recoveredAfterRetry !== null) {
          logRecoveredInsert({
            context: recoveryContext,
          });
          return recoveredAfterRetry;
        }

        throw retryError;
      }
    }
  }

  override async run(placeholderValues?: Record<string, unknown>) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);

    if (this.insertQueryMetadata?.type !== "insert") {
      return await executeWithBaseQueryCache({
        execute: async () => this.stmt.bind(...params).run(),
        params,
        preparedQuery: this,
        queryString: this.query.sql,
      });
    }

    return await this.executeInsertWithRecovery({
      queryString: this.query.sql,
      params,
      execute: async () => this.stmt.bind(...params).run(),
      recover: async (context) => {
        const didCommit = await canConfirmInsertedRows({
          client: this.client,
          context,
          tableMetadataByName: this.tableMetadataByName,
        });

        if (!didCommit) {
          return null;
        }

        return createRecoveredRunResponse({
          rowCount: context.primaryKeyValues.length,
        });
      },
    });
  }

  override async all(placeholderValues?: Record<string, unknown>) {
    if (!this.fields && !this.customResultMapper) {
      const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
      this.logger.logQuery(this.query.sql, params);

      return await executeWithBaseQueryCache({
        execute: async () => {
          return this.stmt.bind(...params).all().then(({ results }) => this.mapAllResult(results));
        },
        params,
        preparedQuery: this,
        queryString: this.query.sql,
      });
    }

    const rows = await this.values(placeholderValues);
    return this.mapAllResult(rows);
  }

  override async get(placeholderValues?: Record<string, unknown>) {
    if (!this.fields && !this.customResultMapper) {
      const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
      this.logger.logQuery(this.query.sql, params);

      return await executeWithBaseQueryCache({
        execute: async () => this.stmt.bind(...params).all().then(({ results }) => results[0]),
        params,
        preparedQuery: this,
        queryString: this.query.sql,
      });
    }

    const rows = await this.values(placeholderValues);
    if (!rows[0]) {
      return undefined;
    }

    if (this.customResultMapper) {
      return this.customResultMapper(rows);
    }

    return mapResultRow(this.fields!, rows[0], getJoinsNotNullableMap(this));
  }

  override async values<TValues extends any[] = unknown[]>(
    placeholderValues?: Record<string, unknown>,
  ): Promise<TValues[]> {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);

    if (this.insertQueryMetadata?.type !== "insert") {
      return await executeWithBaseQueryCache({
        execute: async () => this.stmt.bind(...params).raw<TValues>(),
        params,
        preparedQuery: this,
        queryString: this.query.sql,
      });
    }

    return await this.executeInsertWithRecovery({
      queryString: this.query.sql,
      params,
      execute: async () => this.stmt.bind(...params).raw<TValues>(),
      recover: async (context) => {
        const recoveredRows = await recoverInsertedRows({
          client: this.client,
          context,
          tableMetadataByName: this.tableMetadataByName,
        });

        return recoveredRows as TValues[] | null;
      },
    });
  }

  override mapAllResult(rows: unknown, isFromBatch?: boolean) {
    if (isFromBatch) {
      rows = d1ToRawMapping((rows as { results: Array<Record<string, unknown>> }).results);
    }

    if (!this.fields && !this.customResultMapper) {
      return rows;
    }

    if (this.customResultMapper) {
      return this.customResultMapper(rows as unknown[][]);
    }

    return (rows as unknown[][]).map((row) =>
      mapResultRow(this.fields!, row, getJoinsNotNullableMap(this)),
    );
  }

  override mapGetResult(result: unknown, isFromBatch?: boolean) {
    if (isFromBatch) {
      result = d1ToRawMapping((result as { results: Array<Record<string, unknown>> }).results)[0];
    }

    if (!this.fields && !this.customResultMapper) {
      return result;
    }

    if (this.customResultMapper) {
      return this.customResultMapper([result as unknown[]]);
    }

    return mapResultRow(this.fields!, result as unknown[], getJoinsNotNullableMap(this));
  }

  getStatement() {
    return this.stmt;
  }

  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
}

class RecoveringD1Session<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
  extends SQLiteSession<"async", D1Result, TFullSchema, TSchema> {
  private readonly cache: Cache;
  private readonly client: D1Database;
  private readonly dialectRef: SQLiteAsyncDialect;
  private readonly logger: Logger;
  private readonly schema: RelationalSchemaConfig<TSchema> | undefined;
  private readonly tableMetadataByName: Map<string, TableRecoveryMetadata>;

  constructor({
    client,
    dialect,
    options = {},
    schema,
    tableMetadataByName,
  }: {
    client: D1Database;
    dialect: SQLiteAsyncDialect;
    options?: SQLiteD1SessionOptions;
    schema: RelationalSchemaConfig<TSchema> | undefined;
    tableMetadataByName: Map<string, TableRecoveryMetadata>;
  }) {
    super(dialect);
    this.cache = options.cache ?? new NoopCache();
    this.client = client;
    this.dialectRef = dialect;
    this.logger = options.logger ?? new NoopLogger();
    this.schema = schema;
    this.tableMetadataByName = tableMetadataByName;
  }

  override prepareQuery(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
    queryMetadata?: InsertQueryMetadata,
    cacheConfig?: WithCacheConfig,
  ) {
    const stmt = this.client.prepare(query.sql);

    return new RecoveringD1PreparedQuery({
      cache: this.cache,
      cacheConfig,
      client: this.client,
      customResultMapper,
      executeMethod,
      fields,
      isResponseInArrayMode,
      logger: this.logger,
      query,
      queryMetadata,
      stmt,
      tableMetadataByName: this.tableMetadataByName,
    });
  }

  async batch<T extends readonly unknown[]>(queries: T) {
    const preparedQueries: Array<RecoveringD1PreparedQuery> = [];
    const builtQueries: D1PreparedStatement[] = [];

    for (const query of queries as unknown as Array<{ _prepare: () => RecoveringD1PreparedQuery }>) {
      const preparedQuery = query._prepare();
      const builtQuery = preparedQuery.getQuery();
      preparedQueries.push(preparedQuery);

      if (builtQuery.params.length > 0) {
        builtQueries.push(preparedQuery.getStatement().bind(...builtQuery.params));
      } else {
        builtQueries.push(this.client.prepare(builtQuery.sql).bind(...builtQuery.params));
      }
    }

    const batchResults = await this.client.batch(builtQueries);
    return batchResults.map((result, index) => preparedQueries[index].mapResult(result, true));
  }

  extractRawAllValueFromBatchResult(result: unknown) {
    return (result as { results: unknown[] }).results;
  }

  extractRawGetValueFromBatchResult(result: unknown) {
    return (result as { results: unknown[] }).results[0];
  }

  extractRawValuesValueFromBatchResult(result: unknown) {
    return d1ToRawMapping((result as { results: Array<Record<string, unknown>> }).results);
  }

  override async transaction<T>(
    transaction: (tx: RecoveringD1Transaction<TFullSchema, TSchema>) => T | Promise<T>,
    config?: SQLiteTransactionConfig,
  ) {
    const tx = new RecoveringD1Transaction(
      "async",
      this.dialectRef,
      this,
      this.schema,
    );
    await this.run(sql.raw(`begin${config?.behavior ? ` ${config.behavior}` : ""}`));

    try {
      const result = await transaction(tx);
      await this.run(sql`commit`);
      return result;
    } catch (error) {
      await this.run(sql`rollback`);
      throw error;
    }
  }
}

class RecoveringD1Transaction<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
  extends SQLiteTransaction<"async", D1Result, TFullSchema, TSchema> {
  private readonly dialectRef: SQLiteAsyncDialect;
  private readonly sessionRef: SQLiteSession<"async", D1Result, TFullSchema, TSchema>;

  constructor(
    resultType: "async",
    dialect: SQLiteAsyncDialect,
    session: SQLiteSession<"async", D1Result, TFullSchema, TSchema>,
    schema: RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex?: number,
  ) {
    super(resultType, dialect, session, schema, nestedIndex);
    this.dialectRef = dialect;
    this.sessionRef = session;
  }

  override async transaction<T>(
    transaction: (tx: RecoveringD1Transaction<TFullSchema, TSchema>) => Promise<T>,
  ) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new RecoveringD1Transaction(
      "async",
      this.dialectRef,
      this.sessionRef,
      this.schema,
      this.nestedIndex + 1,
    );

    await this.sessionRef.run(sql.raw(`savepoint ${savepointName}`));

    try {
      const result = await transaction(tx);
      await this.sessionRef.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (error) {
      await this.sessionRef.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw error;
    }
  }
}

export function drizzleWithInsertRecovery<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends D1Database = D1Database,
>(client: TClient, config: DrizzleConfig<TSchema> = {}) {
  const dialect = new SQLiteAsyncDialect({ casing: config.casing });
  let tableMetadataByName = new Map<string, TableRecoveryMetadata>();

  let drizzleLogger: Logger | undefined;
  if (config.logger === true) {
    drizzleLogger = new DefaultLogger();
  } else if (config.logger !== false) {
    drizzleLogger = config.logger;
  }

  let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers,
    );
    tableMetadataByName = buildTableRecoveryMetadataByName(tablesConfig.tables);

    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new RecoveringD1Session({
    client,
    dialect,
    schema,
    tableMetadataByName,
    options: {
      cache: config.cache,
      logger: drizzleLogger,
    },
  });

  const db = new DrizzleD1Database("async", dialect, session, schema) as DrizzleD1Database<TSchema> & {
    $cache?: CacheWithInvalidate;
    $client: TClient;
  };

  db.$client = client;
  if (config.cache) {
    const cacheWithInvalidate = config.cache as CacheWithInvalidate;
    cacheWithInvalidate.invalidate = config.cache.onMutate;
    db.$cache = cacheWithInvalidate;
  }

  return db;
}
