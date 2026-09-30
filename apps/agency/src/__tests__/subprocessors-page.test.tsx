import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SUBPROCESSORS_LAST_UPDATED } from "@/lib/subprocessors";
import SubprocessorsPage from "@/app/(legal)/subprocessors/page";

describe("Subprocessors page", () => {
  it("renders the dedicated subprocessors registry", () => {
    const markup = renderToStaticMarkup(<SubprocessorsPage />);

    expect(markup).toContain("Subprocessors");
    expect(markup).toContain(`Current as of ${SUBPROCESSORS_LAST_UPDATED}`);
    expect(markup).toContain(
      "A current list of third-party service providers that may process agency account data or client visa documents",
    );
    expect(markup).toContain("Name");
    expect(markup).toContain("Purpose");
    expect(markup).toContain("Location");
    expect(markup).toContain("Website");
	    expect(markup).toContain("OpenAI");
	    expect(markup).toContain("Perplexity");
	    expect(markup).toContain("Cloudflare");
	    expect(markup).toContain("Resend");
    expect(markup).toContain("Google");
    expect(markup).toContain("Sentry");
    expect(markup).toContain("Debounce");
    expect(markup).toContain("Mailcheck.ai");
    expect(markup).toContain("https://openai.com");
    expect(markup).toContain("https://www.cloudflare.com/");
  });
});
