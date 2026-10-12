import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  permission: vi.fn(),
  queue: vi.fn(),
  status: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("zsa", () => ({
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) => fn({ input }),
    };
    return chain;
  },
}));
vi.mock("@/utils/application-auth", () => ({ requireApplicationPermission: state.permission }));
vi.mock("@/server/checklist-jobs", () => ({
  requestChecklistJob: state.queue,
  getLatestChecklistJob: state.status,
}));
vi.mock("@/infra/action-rate-limit", () => ({ checkActionRateLimit: state.rateLimit }));
vi.mock("@/infra/usage-tracking", () => ({
  trackUsage: vi.fn(),
  USAGE_EVENTS: { CHECKLIST_GENERATED: "checklist" },
}));
import { generateChecklistAction, getChecklistJobAction } from "@/actions/checklist.action";
const input = { applicationId: "case", applicantId: "person" };
beforeEach(() => {
  vi.clearAllMocks();
  state.permission.mockResolvedValue({ userId: "staff" });
  state.queue.mockResolvedValue({ id: "cjob_test", status: "queued" });
  state.status.mockResolvedValue(null);
});
it("queues an authenticated refresh without running generation in the request", async () => {
  expect(await generateChecklistAction({ ...input, refreshResearch: true })).toMatchObject({
    status: "queued",
  });
  expect(state.permission).toHaveBeenCalledWith("case", "access_application");
  expect(state.rateLimit).toHaveBeenCalledWith("generateChecklist", "staff", 5);
  expect(state.queue).toHaveBeenCalledWith({ ...input, refreshResearch: true, userId: "staff" });
});
it("checks case access before queueing or reading job state", async () => {
  state.permission.mockRejectedValue(new Error("Forbidden"));
  await expect(generateChecklistAction(input)).rejects.toThrow("Forbidden");
  await expect(getChecklistJobAction(input)).rejects.toThrow("Forbidden");
  expect(state.queue).not.toHaveBeenCalled();
  expect(state.status).not.toHaveBeenCalled();
});
it("reads only the selected case and applicant job", async () => {
  await getChecklistJobAction(input);
  expect(state.permission).toHaveBeenCalledWith("case", "access_application");
  expect(state.status).toHaveBeenCalledWith(input);
});
