import { describe, it, expect } from "vitest";

import { isSqlQueryLoggingEnabled } from "@/db/db-logging";

describe("isSqlQueryLoggingEnabled", () => {
  it("disables SQL logging by default in production", () => {
    expect(isSqlQueryLoggingEnabled("production", undefined)).toBe(false);
  });

  it("enables SQL logging by default outside production", () => {
    expect(isSqlQueryLoggingEnabled("development", undefined)).toBe(true);
    expect(isSqlQueryLoggingEnabled("test", undefined)).toBe(true);
  });

  it("allows explicit env override to enable logging in production", () => {
    expect(isSqlQueryLoggingEnabled("production", "true")).toBe(true);
    expect(isSqlQueryLoggingEnabled("production", "1")).toBe(true);
  });

  it("allows explicit env override to disable logging outside production", () => {
    expect(isSqlQueryLoggingEnabled("development", "false")).toBe(false);
    expect(isSqlQueryLoggingEnabled("development", "0")).toBe(false);
  });
});
