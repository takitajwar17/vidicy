import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ verify: vi.fn(), process: vi.fn() }));
vi.mock("@/infra/google/internal-auth", () => ({ verifyInternalGoogleRequest: state.verify }));
vi.mock("@/server/checklist-jobs", () => ({ processChecklistJob: state.process }));
import { POST } from "@/app/api/internal/checklist-generation/route";
beforeEach(() => {
  state.verify.mockReset().mockResolvedValue(null);
  state.process.mockReset().mockResolvedValue(undefined);
});
function request(body: unknown) {
  return new Request("http://isolated.test/api/internal/checklist-generation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
it("checks machine identity before reading or running the task", async () => {
  state.verify.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await POST(request({ jobId: "cjob_test" }))).status).toBe(401);
  expect(state.process).not.toHaveBeenCalled();
});
it.each([
  {},
  { jobId: "other" },
  { jobId: "cjob_test", extra: true },
  { jobId: "cjob_" + "a".repeat(5000) },
])("rejects invalid or oversized payloads: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(state.process).not.toHaveBeenCalled();
});
it("acknowledges completed work and requests retries after failure", async () => {
  expect((await POST(request({ jobId: "cjob_test" }))).status).toBe(204);
  state.process.mockRejectedValue(new Error("private provider reply"));
  const response = await POST(request({ jobId: "cjob_test" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private provider reply");
});
