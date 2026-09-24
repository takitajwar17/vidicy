import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PackageJson = {
  scripts?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

describe("package script naming", () => {
  it("exposes explicit worker lifecycle scripts", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts["worker:build"]).toBeDefined();
    expect(scripts["worker:deploy"]).toBeDefined();
    expect(scripts["worker:preview"]).toBeDefined();
  });

  it("routes the user-facing deploy scripts through the explicit worker scripts", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts["deploy:dry-run"]).toContain("pnpm run worker:build");
    expect(scripts.deploy).toBe("pnpm run worker:deploy");
    expect(scripts.preview).toBe("pnpm run worker:preview");
  });

  it("does not rely on a generated-worker postbuild rewrite", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts["worker:build"]).toBe("opennextjs-cloudflare build");
    expect(scripts["worker:build"]).not.toContain("postbuild-worker");
  });

  it("does not expose agency blog maintenance scripts", () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts["blog:optimize-images"]).toBeUndefined();
    expect(scripts["blog:generate"]).toBeUndefined();
    expect(scripts["blog:workflow"]).toBeUndefined();
    expect(scripts["content:freshness"]).toBeUndefined();
  });
});
