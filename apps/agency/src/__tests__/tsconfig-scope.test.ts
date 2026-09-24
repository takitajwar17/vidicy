import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

describe("tsconfig scope", () => {
  it("does not include the generated worker entry in the app typecheck roots", () => {
    const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");

    if (!configPath) {
      throw new Error("Could not find tsconfig.json");
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

    const normalizedRootFiles = parsed.fileNames.map((file) =>
      path.normalize(path.resolve(path.dirname(configPath), file)),
    );

    expect(normalizedRootFiles).not.toContain(path.normalize(path.resolve("worker.ts")));
  });
});
