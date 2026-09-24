import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

describe("announcement schema migration", () => {
  it("ships announcement updateCounter columns in forward migrations and metadata", () => {
    const forwardMigration = readRepoFile(
      "src/db/migrations/0009_add_announcement_update_counters.sql",
    );
    const latestSnapshot = JSON.parse(readRepoFile(getLatestSnapshotPath())) as {
      tables: Record<string, { columns?: Record<string, { default?: unknown }> }>;
    };
    const journal = JSON.parse(readRepoFile("src/db/migrations/meta/_journal.json")) as {
      entries: Array<{ tag: string }>;
    };

    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_post` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_poll_option` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_poll_vote` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_upvote` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_comment` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(forwardMigration).toContain(
      "ALTER TABLE `announcement_read` ADD COLUMN `updateCounter` integer DEFAULT 0;",
    );
    expect(journal.entries.some((entry) => entry.tag === "0009_add_announcement_update_counters")).toBe(true);
    expect(latestSnapshot.tables.announcement_post.columns?.updateCounter?.default).toBe(0);
    expect(latestSnapshot.tables.announcement_comment.columns?.updateCounter?.default).toBe(0);
  });
});
