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

describe("database composite indexes", () => {
  it("declares the expected composite indexes in the schema", () => {
    const chatSchema = readRepoFile("src/db/schema/chat.ts");
    const applicantSchema = readRepoFile("src/db/schema/applicant.ts");
    const visaApplicationSchema = readRepoFile("src/db/schema/visa-application.ts");
    const checklistSchema = readRepoFile("src/db/schema/checklist.ts");
    const documentSchema = readRepoFile("src/db/schema/document.ts");
    const normalize = (value: string) => value.replace(/\s+/g, " ");

    expect(normalize(chatSchema)).toContain("chat_conv_app_updated_idx");
    expect(normalize(chatSchema)).toContain("table.applicationId, table.updatedAt");
    expect(normalize(chatSchema)).toContain("chat_msg_conv_created_idx");
    expect(normalize(chatSchema)).toContain("table.conversationId, table.createdAt");
    expect(normalize(applicantSchema)).toContain("applicant_app_created_idx");
    expect(normalize(applicantSchema)).toContain("table.applicationId, table.createdAt");
    expect(normalize(visaApplicationSchema)).toContain("visa_app_user_created_idx");
    expect(normalize(visaApplicationSchema)).toContain("table.userId, table.createdAt");
    expect(normalize(visaApplicationSchema)).toContain("visa_app_user_trashed_created_idx");
    expect(normalize(visaApplicationSchema)).toContain(
      "table.userId, table.trashedAt, table.createdAt",
    );
    expect(normalize(checklistSchema)).toContain("checklist_item_app_applicant_sort_idx");
    expect(normalize(checklistSchema)).toContain(
      "table.applicationId, table.applicantId, table.sortOrder",
    );
    expect(normalize(documentSchema)).toContain("uploaded_doc_app_applicant_uploaded_idx");
    expect(normalize(documentSchema)).toContain(
      "table.applicationId, table.applicantId, table.uploadedAt",
    );
    expect(normalize(documentSchema)).toContain("uploaded_doc_app_checklist_item_idx");
    expect(normalize(documentSchema)).toContain("table.applicationId, table.checklistItemId");
    expect(normalize(documentSchema)).toContain("uploaded_doc_app_uploaded_idx");
    expect(normalize(documentSchema)).toContain("table.applicationId, table.uploadedAt");
    expect(normalize(documentSchema)).toContain("doc_eval_app_applicant_created_idx");
    expect(normalize(documentSchema)).toContain(
      "table.applicationId, table.applicantId, table.createdAt",
    );
    expect(normalize(documentSchema)).toContain("doc_eval_app_created_idx");
    expect(normalize(documentSchema)).toContain("table.applicationId, table.createdAt");
  });

  it("ships the expected composite indexes in the latest migration artifacts", () => {
    const existingCompositeIndexMigration = readRepoFile(
      "src/db/migrations/0004_add_hot_composite_indexes.sql",
    );
    const latestCompositeIndexMigration = readRepoFile(
      "src/db/migrations/0006_add_document_hot_indexes.sql",
    );
    const latestSnapshot = JSON.parse(readRepoFile(getLatestSnapshotPath())) as {
      tables: Record<string, { indexes?: Record<string, { isUnique?: boolean }> }>;
    };

    expect(existingCompositeIndexMigration).toContain(
      "CREATE INDEX `chat_conv_app_updated_idx` ON `chat_conversation` (`applicationId`,`updatedAt`);",
    );
    expect(existingCompositeIndexMigration).toContain(
      "CREATE INDEX `chat_msg_conv_created_idx` ON `chat_message` (`conversationId`,`createdAt`);",
    );
    expect(existingCompositeIndexMigration).toContain(
      "CREATE INDEX `applicant_app_created_idx` ON `applicant` (`applicationId`,`createdAt`);",
    );
    expect(existingCompositeIndexMigration).toContain(
      "CREATE INDEX `visa_app_user_created_idx` ON `visa_application` (`userId`,`createdAt`);",
    );
    expect(latestCompositeIndexMigration).toContain(
      "CREATE INDEX `uploaded_doc_app_checklist_item_idx` ON `uploaded_document` (`applicationId`,`checklistItemId`);",
    );
    expect(latestCompositeIndexMigration).toContain(
      "CREATE INDEX `uploaded_doc_app_uploaded_idx` ON `uploaded_document` (`applicationId`,`uploadedAt`);",
    );
    expect(latestCompositeIndexMigration).toContain(
      "CREATE INDEX `doc_eval_app_created_idx` ON `document_evaluation` (`applicationId`,`createdAt`);",
    );
    const journal = JSON.parse(readRepoFile("src/db/migrations/meta/_journal.json")) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.some((entry) => entry.tag === "0004_add_hot_composite_indexes")).toBe(
      true,
    );
    expect(
      journal.entries.some((entry) => entry.tag === "0005_add_remaining_hot_composite_indexes"),
    ).toBe(true);
    expect(journal.entries.some((entry) => entry.tag === "0006_add_document_hot_indexes")).toBe(
      true,
    );
    expect(
      latestSnapshot.tables.chat_conversation.indexes?.chat_conv_app_updated_idx?.isUnique,
    ).toBe(false);
    expect(latestSnapshot.tables.chat_message.indexes?.chat_msg_conv_created_idx?.isUnique).toBe(
      false,
    );
    expect(latestSnapshot.tables.applicant.indexes?.applicant_app_created_idx?.isUnique).toBe(
      false,
    );
    expect(
      latestSnapshot.tables.visa_application.indexes?.visa_app_user_created_idx?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.visa_application.indexes?.visa_app_user_trashed_created_idx?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.checklist_item.indexes?.checklist_item_app_applicant_sort_idx?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.uploaded_document.indexes?.uploaded_doc_app_applicant_uploaded_idx
        ?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.document_evaluation.indexes?.doc_eval_app_applicant_created_idx
        ?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.uploaded_document.indexes?.uploaded_doc_app_checklist_item_idx
        ?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.uploaded_document.indexes?.uploaded_doc_app_uploaded_idx?.isUnique,
    ).toBe(false);
    expect(
      latestSnapshot.tables.document_evaluation.indexes?.doc_eval_app_created_idx?.isUnique,
    ).toBe(false);
  });
});
