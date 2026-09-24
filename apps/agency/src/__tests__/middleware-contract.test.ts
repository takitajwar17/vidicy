import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("middleware contract", () => {
  it("uses the edge-safe CSRF token helper instead of the server-only CSRF module", () => {
    const middlewareSource = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

    expect(middlewareSource).toContain('from "@/infra/csrf-token"');
    expect(middlewareSource).not.toContain('from "@/infra/csrf"');
  });
});
