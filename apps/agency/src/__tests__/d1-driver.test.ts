import { afterAll, describe, expect, it } from "vitest";

import { getDBFromDatabase } from "@/db";
import {
  announcementUpvoteTable,
  chatMessageTable,
  checklistItemTable,
  userTable,
} from "@/db/legacy-d1-schema";

type FailureMode = "commit_then_timeout_once" | "timeout_before_commit_once";

const originalNodeEnv = process.env.NODE_ENV;
const originalDbSqlLog = process.env.DB_SQL_LOG;
const mutableEnv = process.env as Record<string, string | undefined>;

mutableEnv.NODE_ENV = "production";
mutableEnv.DB_SQL_LOG = "false";

function createRetryableInsertError() {
  const error = new Error(
    'Failed query: insert into "table" ("id") values (?) returning "id"',
  ) as Error & { cause?: unknown };
  error.cause = new Error(
    "D1 DB storage operation exceeded timeout which caused object to be reset.",
  );
  return error;
}

function findMatchingParenthesis({ sqlText, startIndex }: { sqlText: string; startIndex: number }) {
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

function normalizeIdentifier(identifier: string) {
  return identifier.trim().replace(/^"|"$/g, "");
}

function extractValuesTuples(valuesSql: string) {
  const tuples: string[] = [];

  for (let index = 0; index < valuesSql.length; index += 1) {
    if (valuesSql[index] !== "(") {
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

function parseInsertStatement({ params, sqlText }: { params: unknown[]; sqlText: string }) {
  const tableMatch = sqlText.match(/insert into "([^"]+)"/i);
  if (!tableMatch) {
    throw new Error(`Unable to parse insert table from SQL: ${sqlText}`);
  }

  const tableName = tableMatch[1];
  const columnsStartIndex = sqlText.indexOf("(", tableMatch.index);
  const columnsEndIndex = findMatchingParenthesis({
    sqlText,
    startIndex: columnsStartIndex,
  });
  const valuesKeywordIndex = sqlText.toLowerCase().indexOf(" values ", columnsEndIndex);
  const returningKeywordIndex = sqlText.toLowerCase().indexOf(" returning ", valuesKeywordIndex);
  const columnsSql = sqlText.slice(columnsStartIndex + 1, columnsEndIndex);
  const valuesSql = sqlText.slice(
    valuesKeywordIndex + " values ".length,
    returningKeywordIndex === -1 ? sqlText.length : returningKeywordIndex,
  );
  const returningClause =
    returningKeywordIndex === -1
      ? null
      : sqlText.slice(returningKeywordIndex + " returning ".length).trim();

  const columns = splitTopLevelCsv(columnsSql).map(normalizeIdentifier);
  const tuples = extractValuesTuples(valuesSql);
  if (!tuples) {
    throw new Error(`Unable to parse insert tuples from SQL: ${sqlText}`);
  }

  const rows: Array<Record<string, unknown>> = [];
  let paramIndex = 0;

  for (const tuple of tuples) {
    const expressions = splitTopLevelCsv(tuple);
    const row: Record<string, unknown> = {};

    for (const [expressionIndex, expression] of expressions.entries()) {
      const columnName = columns[expressionIndex];
      const normalizedExpression = expression.trim().toLowerCase();

      if (normalizedExpression === "?") {
        row[columnName] = params[paramIndex];
        paramIndex += 1;
      } else if (normalizedExpression === "null") {
        row[columnName] = null;
      } else {
        row[columnName] = expression.trim();
      }
    }

    rows.push(row);
  }

  return {
    returningClause,
    rows,
    tableName,
  };
}

function buildProjectedRawRows({
  projectionSql,
  rows,
}: {
  projectionSql: string;
  rows: Array<Record<string, unknown>>;
}) {
  const selectedColumns = splitTopLevelCsv(projectionSql).map(normalizeIdentifier);
  return rows.map((row) => selectedColumns.map((columnName) => row[columnName] ?? null));
}

function buildProjectedObjectRows({
  projectionSql,
  rows,
}: {
  projectionSql: string;
  rows: Array<Record<string, unknown>>;
}) {
  const selectedColumns = splitTopLevelCsv(projectionSql).map(normalizeIdentifier);
  return rows.map((row) =>
    Object.fromEntries(selectedColumns.map((columnName) => [columnName, row[columnName] ?? null])),
  );
}

class MockD1PreparedStatement {
  constructor(
    private readonly database: MockD1Database,
    private readonly sqlText: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new MockD1PreparedStatement(this.database, this.sqlText, params);
  }

  async all<T = Record<string, unknown>>() {
    return this.database.executeAll<T>({
      params: this.params,
      sqlText: this.sqlText,
    });
  }

  async raw<T = unknown[]>() {
    return this.database.executeRaw<T>({
      params: this.params,
      sqlText: this.sqlText,
    });
  }

  async run() {
    return this.database.executeRun({
      params: this.params,
      sqlText: this.sqlText,
    });
  }
}

class MockD1Database {
  private readonly failures = new Map<string, { mode: FailureMode; used: boolean }>();
  private readonly rowsByTable = new Map<string, Map<unknown, Record<string, unknown>>>();

  constructor(failureModes: Partial<Record<string, FailureMode>> = {}) {
    for (const [tableName, mode] of Object.entries(failureModes)) {
      if (!mode) {
        continue;
      }

      this.failures.set(tableName, {
        mode,
        used: false,
      });
    }
  }

  prepare(sqlText: string) {
    return new MockD1PreparedStatement(this, sqlText);
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  async executeRaw<T>({ params, sqlText }: { params: unknown[]; sqlText: string }) {
    if (sqlText.toLowerCase().startsWith("insert into")) {
      return this.handleInsertRaw<T>({ params, sqlText });
    }

    if (sqlText.toLowerCase().startsWith("select ")) {
      return this.handleSelectRaw<T>({ params, sqlText });
    }

    throw new Error(`Unexpected raw SQL in test double: ${sqlText}`);
  }

  async executeAll<T>({ params, sqlText }: { params: unknown[]; sqlText: string }) {
    if (!sqlText.toLowerCase().startsWith("select ")) {
      throw new Error(`Unexpected all() SQL in test double: ${sqlText}`);
    }

    const projectionMatch = sqlText.match(/^select\s+(.+?)\s+from\s+"([^"]+)"/i);
    if (!projectionMatch) {
      throw new Error(`Unable to parse select projection in SQL: ${sqlText}`);
    }

    const projectionSql = projectionMatch[1];
    const tableName = projectionMatch[2];
    const ids = params.slice(0, params.length / 2);
    const tableRows = this.rowsByTable.get(tableName) ?? new Map();
    const rows = ids
      .map((id) => tableRows.get(id))
      .filter((row): row is Record<string, unknown> => Boolean(row));

    return {
      results: buildProjectedObjectRows({
        projectionSql,
        rows,
      }) as T[],
      success: true,
    };
  }

  async executeRun({ params, sqlText }: { params: unknown[]; sqlText: string }) {
    if (!sqlText.toLowerCase().startsWith("insert into")) {
      throw new Error(`Unexpected run() SQL in test double: ${sqlText}`);
    }

    const parsedInsert = parseInsertStatement({ params, sqlText });
    const shouldThrow = this.shouldThrowForInsert(parsedInsert.tableName);

    if (shouldThrow?.mode === "commit_then_timeout_once") {
      this.persistRows(parsedInsert.tableName, parsedInsert.rows);
      throw createRetryableInsertError();
    }

    if (shouldThrow?.mode === "timeout_before_commit_once") {
      throw createRetryableInsertError();
    }

    this.persistRows(parsedInsert.tableName, parsedInsert.rows);
    return {
      meta: {
        changes: parsedInsert.rows.length,
        changed_db: true,
      },
      results: [],
      success: true,
    };
  }

  private async handleInsertRaw<T>({ params, sqlText }: { params: unknown[]; sqlText: string }) {
    const parsedInsert = parseInsertStatement({ params, sqlText });
    const shouldThrow = this.shouldThrowForInsert(parsedInsert.tableName);

    if (shouldThrow?.mode === "commit_then_timeout_once") {
      this.persistRows(parsedInsert.tableName, parsedInsert.rows);
      throw createRetryableInsertError();
    }

    if (shouldThrow?.mode === "timeout_before_commit_once") {
      throw createRetryableInsertError();
    }

    this.persistRows(parsedInsert.tableName, parsedInsert.rows);

    if (!parsedInsert.returningClause) {
      return [] as T[];
    }

    return buildProjectedRawRows({
      projectionSql: parsedInsert.returningClause,
      rows: parsedInsert.rows,
    }) as T[];
  }

  private async handleSelectRaw<T>({ params, sqlText }: { params: unknown[]; sqlText: string }) {
    const projectionMatch = sqlText.match(/^select\s+(.+?)\s+from\s+"([^"]+)"/i);
    if (!projectionMatch) {
      throw new Error(`Unable to parse recovery select in SQL: ${sqlText}`);
    }

    const projectionSql = projectionMatch[1];
    const tableName = projectionMatch[2];
    const ids = params.slice(0, params.length / 2);
    const tableRows = this.rowsByTable.get(tableName) ?? new Map();
    const rows = ids
      .map((id) => tableRows.get(id))
      .filter((row): row is Record<string, unknown> => Boolean(row));

    return buildProjectedRawRows({
      projectionSql,
      rows,
    }) as T[];
  }

  private persistRows(tableName: string, rows: Array<Record<string, unknown>>) {
    const tableRows =
      this.rowsByTable.get(tableName) ?? new Map<unknown, Record<string, unknown>>();
    for (const row of rows) {
      tableRows.set(row.id, row);
    }
    this.rowsByTable.set(tableName, tableRows);
  }

  private shouldThrowForInsert(tableName: string) {
    const failure = this.failures.get(tableName);
    if (!failure || failure.used) {
      return null;
    }

    failure.used = true;
    return failure;
  }
}

describe("drizzleWithInsertRecovery", () => {
  it("recovers a committed single-row insert with returning()", async () => {
    const database = new MockD1Database({
      user: "commit_then_timeout_once",
    }) as unknown as D1Database;
    const db = getDBFromDatabase(database);

    const [user] = await db
      .insert(userTable)
      .values({
        email: "gleecon2020@gmail.com",
        firstName: "Glee",
        lastName: "Con",
      })
      .returning();

    expect(user.id).toMatch(/^usr_/);
    expect(user.email).toBe("gleecon2020@gmail.com");
    expect(user.firstName).toBe("Glee");
    expect(user.lastName).toBe("Con");
  });

  it("retries a single-row insert when the timeout happens before commit", async () => {
    const database = new MockD1Database({
      user: "timeout_before_commit_once",
    }) as unknown as D1Database;
    const db = getDBFromDatabase(database);

    const [user] = await db
      .insert(userTable)
      .values({
        email: "retry@example.com",
        firstName: "Retry",
        lastName: "Path",
      })
      .returning();

    expect(user.id).toMatch(/^usr_/);
    expect(user.email).toBe("retry@example.com");
  });

  it("recovers a committed batch insert with returning()", async () => {
    const database = new MockD1Database({
      checklist_item: "commit_then_timeout_once",
    }) as unknown as D1Database;
    const db = getDBFromDatabase(database);

    const items = await db
      .insert(checklistItemTable)
      .values([
        {
          applicationId: "vapp_1",
          applicantId: "appl_1",
          documentName: "Passport",
          description: "Provide your passport.",
          commonMistakes: "Do not upload an expired copy.",
          isRequired: true,
          status: "pending",
          sortOrder: 1,
        },
        {
          applicationId: "vapp_1",
          applicantId: "appl_1",
          documentName: "Bank Statement",
          description: "Provide the latest bank statement.",
          commonMistakes: "Do not crop the balances.",
          isRequired: true,
          status: "pending",
          sortOrder: 2,
        },
      ])
      .returning();

    expect(items).toHaveLength(2);
    expect(items[0].id).toMatch(/^citem_/);
    expect(items[1].id).toMatch(/^citem_/);
    expect(items.map((item) => item.documentName)).toEqual(["Passport", "Bank Statement"]);
  });

  it("recovers a committed chat message insert with returning()", async () => {
    const database = new MockD1Database({
      chat_message: "commit_then_timeout_once",
    }) as unknown as D1Database;
    const db = getDBFromDatabase(database);

    const [message] = await db
      .insert(chatMessageTable)
      .values({
        applicationId: "vapp_1",
        conversationId: "cconv_1",
        role: "user",
        content: "What are the problems in my application?",
      })
      .returning();

    expect(message.id).toMatch(/^cmsg_/);
    expect(message.role).toBe("user");
    expect(message.content).toBe("What are the problems in my application?");
  });

  it("confirms committed inserts without returning()", async () => {
    const database = new MockD1Database({
      announcement_upvote: "commit_then_timeout_once",
    }) as unknown as D1Database;
    const db = getDBFromDatabase(database);

    const result = await db.insert(announcementUpvoteTable).values({
      postId: "apost_1",
      userId: "usr_1",
    });

    expect(result.success).toBe(true);
    expect(result.meta.changes).toBe(1);
  });
});

afterAll(() => {
  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }

  if (originalDbSqlLog === undefined) {
    delete mutableEnv.DB_SQL_LOG;
  } else {
    mutableEnv.DB_SQL_LOG = originalDbSqlLog;
  }
});
