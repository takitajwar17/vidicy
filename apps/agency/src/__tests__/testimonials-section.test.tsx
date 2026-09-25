import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Testimonials from "@/components/sections/testimonials";

describe("Testimonials section", () => {
  it("renders the refreshed testimonial section copy and text escaping safely", () => {
    const markup = renderToStaticMarkup(<Testimonials />);

    expect(markup).toContain(
      "Stories from applicants who used Vidicy to catch document issues before submission",
    );
    expect(markup).toContain("James O&#x27;Brien");
    expect(markup).toContain("-webkit-mask-image:linear-gradient(to bottom");
    expect(markup).toContain("mask-image:linear-gradient(to bottom");
    expect(markup).toContain("py-14 sm:py-20");
    expect(markup).not.toContain("bg-gradient-to-t from-background from-20%");
    expect(markup).not.toContain("bg-gradient-to-b from-background from-20%");
    expect(markup).not.toContain("&amp;apos;");
    expect(markup).not.toContain("James O&amp;apos;Brien");
  });
});
