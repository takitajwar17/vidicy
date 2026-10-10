import { it, vi } from "vitest";
import { Pool } from "pg";
const state = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: state.db,
}));
vi.mock("@/services/agency-evaluation", () => ({
  runAgencyEvaluation: async () => {
    process.kill(process.pid, "SIGKILL");
  },
}));
import { getDBFromDatabase } from "@/db";
import { processReviewJob } from "@/server/review-jobs";

it("exits during work without releasing its saved claim", async () => {
  const host = process.env.REVIEW_WORKER_TEST_SOCKET;
  const database = process.env.REVIEW_WORKER_TEST_DATABASE;
  const jobId = process.env.REVIEW_WORKER_TEST_JOB;
  if (
    !host?.startsWith("/tmp/vidicy-pg-") ||
    !/^workflow_[a-f0-9]+$/.test(database ?? "") ||
    !/^rjob_[a-z0-9]+$/.test(jobId ?? "")
  )
    throw new Error("Private recovery fixture is required");
  state.db.mockReturnValue(
    getDBFromDatabase(new Pool({ host, port: 5432, user: "postgres", database })),
  );
  await processReviewJob({ jobId: jobId! });
  throw new Error("Worker did not exit at the expected boundary");
});
