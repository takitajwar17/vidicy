import { describe, expect, it, vi } from "vitest";
import { withSettingsConnectionError } from "@/lib/agency-settings-action";

describe("agency settings connection failures", () => {
  it("returns an action error when the transport rejects", async () => {
    const action = vi.fn().mockRejectedValue(new Error("Private connection details"));
    const run = withSettingsConnectionError(action);
    await expect(run({ csrfToken: "token" })).resolves.toEqual([
      null,
      {
        name: "ZSAError",
        code: "ERROR",
        message: "The request failed. Check the page before you try again.",
      },
    ]);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("preserves successful and rejected server results", async () => {
    const result = [{ code: "test-code" }, null];
    const failure = [null, { code: "FORBIDDEN", message: "Admin access required" }];
    const action = vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce(failure);
    const run = withSettingsConnectionError(action);
    const input = { email: "staff@example.test", csrfToken: "token" };
    await expect(run(input)).resolves.toBe(result);
    await expect(run(input)).resolves.toBe(failure);
    expect(action).toHaveBeenCalledWith(input);
  });
});
