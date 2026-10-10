import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createTask: vi.fn() }));
vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: class {
    createTask = state.createTask;
  },
}));
import { enqueueReviewJob } from "@/infra/google/review-tasks";

beforeEach(() => {
  state.createTask.mockReset().mockResolvedValue([]);
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "isolated-test");
  vi.stubEnv("GOOGLE_CLOUD_REGION", "asia-southeast1");
  vi.stubEnv("GOOGLE_CLOUD_SERVICE_ACCOUNT", "worker@isolated-test.iam.gserviceaccount.com");
  vi.stubEnv("DOCUMENT_TASK_BASE_URL", "https://isolated-test.run.app");
  vi.stubEnv("REVIEW_TASK_QUEUE", "review-test");
});
afterEach(() => vi.unstubAllEnvs());

it("waits for acceptance and sends only the job ID to the authenticated worker", async () => {
  let accept!: () => void;
  state.createTask.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  let finished = false;
  const delivery = enqueueReviewJob({ jobId: "rjob_test" }).then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  const [request, options] = state.createTask.mock.calls[0];
  expect(request.parent).toBe(
    "projects/isolated-test/locations/asia-southeast1/queues/review-test",
  );
  expect(request.task.dispatchDeadline).toEqual({ seconds: 1800 });
  expect(request.task.httpRequest).toMatchObject({
    url: "https://isolated-test.run.app/api/internal/case-review",
    httpMethod: "POST",
    oidcToken: {
      serviceAccountEmail: "worker@isolated-test.iam.gserviceaccount.com",
      audience: "https://isolated-test.run.app",
    },
  });
  expect(JSON.parse(request.task.httpRequest.body.toString())).toEqual({ jobId: "rjob_test" });
  expect(options).toEqual({ timeout: 30000 });
  accept();
  await delivery;
  expect(finished).toBe(true);
});

it("reuses the initial task name and gives recovery delivery a new name", async () => {
  await enqueueReviewJob({ jobId: "rjob_test" });
  await enqueueReviewJob({ jobId: "rjob_test" });
  await enqueueReviewJob({ jobId: "rjob_test", version: "recovery:1" });
  const names = state.createTask.mock.calls.map(([request]) => request.task.name);
  expect(names[1]).toBe(names[0]);
  expect(names[2]).not.toBe(names[0]);
});

it.each([6, "ALREADY_EXISTS"])("accepts duplicate task responses: %s", async (code) => {
  state.createTask.mockRejectedValue({ code });
  await expect(enqueueReviewJob({ jobId: "rjob_test" })).resolves.toBeUndefined();
});

it("keeps provider details out of enqueue errors", async () => {
  state.createTask.mockRejectedValue(new Error("private credential and request data"));
  await expect(enqueueReviewJob({ jobId: "rjob_test" })).rejects.toThrow(
    "Cloud Tasks could not accept review work",
  );
});

it("rejects a noncanonical target before sending the service token", async () => {
  vi.stubEnv("DOCUMENT_TASK_BASE_URL", "https://untrusted.example.test");
  await expect(enqueueReviewJob({ jobId: "rjob_test" })).rejects.toThrow(
    "Cloud Run service origin",
  );
  expect(state.createTask).not.toHaveBeenCalled();
});
