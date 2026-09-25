import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { SITE_DESCRIPTION, SITE_NAME } from "@/constants";

describe("manifest metadata route", () => {
  it("publishes the current brand icons for crawlers and install surfaces", () => {
    expect(manifest()).toEqual({
      name: SITE_NAME,
      short_name: SITE_NAME,
      description: SITE_DESCRIPTION,
      start_url: "/",
      display: "standalone",
      background_color: "#f8fafc",
      theme_color: "#0f274d",
      icons: [
        {
          src: "/favicon-48.png",
          sizes: "48x48",
          type: "image/png",
        },
        {
          src: "/favicon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    });
  });
});
