import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AgencyHome from "@/app/(agency-home)/page";

async function renderMarketingHomepageMarkup() {
  const stream = await renderToReadableStream(
    await AgencyHome(),
  );

  await stream.allReady;

  return new Response(stream).text();
}

describe("main marketing homepage route", () => {
  it("renders the minimal agency landing page on /", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).toContain("Vidicy");
    expect(markup).toContain("Review visa applications faster in scale");
    expect(markup).toContain("check client files for missing documents");
    expect(markup).toContain("Upload client documents");
    expect(markup).toContain("Review results");
    expect(markup).toContain("Upload files");
    expect(markup).toContain("Missing bank statement");
    expect(markup).toContain("Client report ready");
    expect(markup).toContain("Turn manual review into a repeatable workflow");
    expect(markup).toContain(
      "/videos/vidicy-hero.mp4",
    );
    expect(markup).toContain('href="/sign-in"');
    expect(markup).toContain('href="/sign-up"');
    expect(markup).toContain("Login");
    expect(markup).toContain("Sign up");
    expect(markup).not.toContain("Logopipsum");
    expect(markup).not.toContain("Small Mistake");
    expect(markup).not.toContain("Visa Rejected");
    expect(markup).not.toContain("Get My Free Review");
  });

  it("does not wire / through the landing page stack", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(agency-home)/page.tsx"), "utf8");

    expect(source).not.toContain("@/components/homepage");
    expect(source).not.toContain("HomepageLanding");
    expect(source).not.toContain("renderHomepage");
  });

  it("does not render the public marketing chrome on /", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).not.toContain("Skip to main content");
    expect(markup).not.toContain("All rights reserved.");
    expect(markup).not.toContain("Start Your Free Evaluation Before You Submit");
  });

  it("does not render blog teasers on the agency homepage", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).not.toContain("Visa Success Blog");
    expect(markup).not.toContain("BlogCard");
    expect(markup).not.toContain("BlogSection");
  });
});
