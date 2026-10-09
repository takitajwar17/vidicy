import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { applicationRoleTable } from "@/db/schema";

const repoPath = process.cwd();

function readRepoFile(relativePath: string) {
  return readFileSync(path.resolve(repoPath, relativePath), "utf8");
}

function getLatestSnapshotPath() {
  const journal = JSON.parse(readRepoFile("src/db/migrations/meta/_journal.json")) as {
    entries: Array<{ tag: string }>;
  };

  const latestTag = journal.entries.at(-1)?.tag;
  if (!latestTag) {
    throw new Error("Migration journal is empty");
  }

  return `src/db/migrations/meta/${latestTag.split("_")[0]}_snapshot.json`;
}

describe("application role schema", () => {
  it("defines application role names as unique per application in the Drizzle schema", () => {
    const index = getTableConfig(applicationRoleTable).indexes.find(
      (index) => index.config.name === "app_role_name_unique_idx",
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
      "applicationId",
      "name",
    ]);
  });

  it("ships a unique application-role name index in the migration artifacts", () => {
    const forwardMigration = readRepoFile(
      "src/db/migrations/0003_enforce_unique_application_role_name.sql",
    );
    const latestSnapshot = JSON.parse(readRepoFile(getLatestSnapshotPath())) as {
      tables: Record<string, { indexes?: Record<string, { isUnique?: boolean }> }>;
    };

    expect(forwardMigration).toContain("DROP INDEX IF EXISTS `app_role_name_unique_idx`;");
    expect(forwardMigration).toContain(
      "CREATE UNIQUE INDEX `app_role_name_unique_idx` ON `application_role` (`applicationId`,`name`);",
    );
    const journal = JSON.parse(readRepoFile("src/db/migrations/meta/_journal.json")) as {
      entries: Array<{ tag: string }>;
    };
    expect(
      journal.entries.some((entry) => entry.tag === "0003_enforce_unique_application_role_name"),
    ).toBe(true);
    expect(latestSnapshot.tables.application_role.indexes?.app_role_name_unique_idx?.isUnique).toBe(
      true,
    );
  });
});
