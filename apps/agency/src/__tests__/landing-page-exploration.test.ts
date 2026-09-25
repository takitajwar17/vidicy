import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { homepageConfig } from "@/components/homepage/config";
import { HomepageLanding } from "@/components/homepage";
import { renderHomepage } from "@/components/homepage/render-page";

async function renderHomepageMarkup() {
  const stream = await renderToReadableStream(
    renderHomepage({
      config: homepageConfig,
      Renderer: HomepageLanding,
    }),
  );

  await stream.allReady;

  return new Response(stream).text();
}

describe("landing homepage configuration", () => {
  it("keeps homepage metadata fields populated", () => {
    expect(homepageConfig.title.length).toBeGreaterThan(0);
    expect(homepageConfig.seoTitle.length).toBeGreaterThan(0);
    expect(homepageConfig.seoDescription.length).toBeGreaterThan(0);
  });

  it("renders homepage schema blocks and landing content", async () => {
    const markup = await renderHomepageMarkup();

    expect(markup).toContain('type="application/ld+json"');
    expect(markup).toContain("Vidicy");
    expect(markup).toContain(homepageConfig.title);
  });

  it("returns the homepage shell synchronously", () => {
    const rendered = renderHomepage({
      config: homepageConfig,
      Renderer: HomepageLanding,
    });

    expect(rendered).not.toBeInstanceOf(Promise);
  });
});
