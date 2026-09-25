import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const trimmedAssets = [
  "public/vidicy-hero-background.mp4",
  "public/vidicy-hero-background-optimized.mp4",
  "public/vidicy-hero-background-trimmed.mp4",
  "public/vidicy-hero-background-optimized-trimmed.mp4",
] as const;

function readDuration(relativePath: string) {
  const output = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path.join(projectRoot, relativePath),
  ], {
    encoding: "utf8",
  });

  return Number(output.trim());
}

describe("hero background video assets", () => {
  it("keeps originals and adds trimmed variants at the target loop duration", () => {
    const originalDuration = readDuration(trimmedAssets[0]);
    const optimizedDuration = readDuration(trimmedAssets[1]);
    const trimmedDuration = readDuration(trimmedAssets[2]);
    const optimizedTrimmedDuration = readDuration(trimmedAssets[3]);

    expect(originalDuration).toBeCloseTo(8, 3);
    expect(optimizedDuration).toBeCloseTo(8, 3);
    expect(trimmedDuration).toBeCloseTo(7.708333, 3);
    expect(optimizedTrimmedDuration).toBeCloseTo(7.708333, 3);
  });
});
