import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInitOpenNextCloudflareForDev = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  initOpenNextCloudflareForDev: mockInitOpenNextCloudflareForDev,
}));

vi.mock("@next/bundle-analyzer", () => ({
  default: () => (config: unknown) => config,
}));

describe("next config", () => {
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    mockInitOpenNextCloudflareForDev.mockReset();
    vi.resetModules();
  });

  it("does not initialize the OpenNext Cloudflare dev shim during production config loading", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;

    env.NODE_ENV = "production";
    delete env.ANALYZE;

    try {
      await import("../../next.config");
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) {
        delete env.ANALYZE;
      } else {
        env.ANALYZE = originalAnalyze;
      }
    }

    expect(mockInitOpenNextCloudflareForDev).not.toHaveBeenCalled();
  });

  it("uses a dedicated distDir for development builds", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;

    env.NODE_ENV = "development";
    delete env.ANALYZE;

    try {
      const config = (await import("../../next.config")).default;
      expect(config.distDir).toBe(".next-dev");
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) delete env.ANALYZE;
      else env.ANALYZE = originalAnalyze;
    }
  });

  it("ignores TypeScript build errors only when SKIP_TYPESCRIPT_CHECKS is enabled", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;
    const originalSkipTypescriptChecks = env.SKIP_TYPESCRIPT_CHECKS;
    const originalSkipLinter = env.SKIP_LINTER;

    env.NODE_ENV = "production";
    delete env.ANALYZE;
    env.SKIP_TYPESCRIPT_CHECKS = "true";
    delete env.SKIP_LINTER;

    try {
      const config = (await import("../../next.config")).default;
      expect(config.typescript?.ignoreBuildErrors).toBe(true);
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) delete env.ANALYZE;
      else env.ANALYZE = originalAnalyze;
      if (originalSkipTypescriptChecks === undefined) delete env.SKIP_TYPESCRIPT_CHECKS;
      else env.SKIP_TYPESCRIPT_CHECKS = originalSkipTypescriptChecks;
      if (originalSkipLinter === undefined) delete env.SKIP_LINTER;
      else env.SKIP_LINTER = originalSkipLinter;
    }
  });

  it("does not treat SKIP_LINTER as a TypeScript build toggle anymore", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;
    const originalSkipTypescriptChecks = env.SKIP_TYPESCRIPT_CHECKS;
    const originalSkipLinter = env.SKIP_LINTER;

    env.NODE_ENV = "production";
    delete env.ANALYZE;
    delete env.SKIP_TYPESCRIPT_CHECKS;
    env.SKIP_LINTER = "true";

    try {
      const config = (await import("../../next.config")).default;
      expect(config.typescript?.ignoreBuildErrors).toBe(false);
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) delete env.ANALYZE;
      else env.ANALYZE = originalAnalyze;
      if (originalSkipTypescriptChecks === undefined) delete env.SKIP_TYPESCRIPT_CHECKS;
      else env.SKIP_TYPESCRIPT_CHECKS = originalSkipTypescriptChecks;
      if (originalSkipLinter === undefined) delete env.SKIP_LINTER;
      else env.SKIP_LINTER = originalSkipLinter;
    }
  });

  it("sets HSTS with preload on global response headers", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;

    env.NODE_ENV = "production";
    delete env.ANALYZE;

    try {
      const config = (await import("../../next.config")).default;
      const headerRules = await config.headers?.();
      const globalHeaders = headerRules?.find((rule) => rule.source === "/(.*)")?.headers ?? [];

      expect(globalHeaders).toContainEqual({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) delete env.ANALYZE;
      else env.ANALYZE = originalAnalyze;
    }
  });

  it("keeps legacy single-segment marketing redirects explicit", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalAnalyze = env.ANALYZE;

    env.NODE_ENV = "production";
    delete env.ANALYZE;

    try {
      const config = (await import("../../next.config")).default;
      const redirects = await config.redirects?.();

      expect(redirects).toContainEqual({
        source: "/pricing",
        destination: "/#pricing",
        permanent: true,
      });
      expect(redirects).toContainEqual({
        source: "/features",
        destination: "/how-it-works",
        permanent: true,
      });
    } finally {
      env.NODE_ENV = originalNodeEnv;
      if (originalAnalyze === undefined) delete env.ANALYZE;
      else env.ANALYZE = originalAnalyze;
    }
  });

});
