import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readDrawerSource() {
  return readFileSync(resolve(process.cwd(), "src/components/drawer.tsx"), "utf8");
}

describe("marketing drawer accessibility", () => {
  it("provides a DrawerTitle inside DrawerContent for screen reader users", () => {
    const source = readDrawerSource();

    expect(source).toContain("DrawerTitle");
    expect(source).toContain("<DrawerTitle");
  });

  it("renders the tighter auth-only mobile drawer presentation", () => {
    const source = readDrawerSource();

    expect(source).not.toContain("Secure access");
    expect(source).toContain("Request pilot access or sign in to continue your agency workflow.");
    expect(source).toContain("PUBLIC_SIGN_UP_CTA_LABEL");
    expect(source).not.toContain("Get Started for Free");
    expect(source).not.toContain('<Logo className="h-6 w-6" />');
  });
});
