import { describe, expect, it } from "vitest";
import { buildGeminiDocumentPrompt } from "@/lib/gemini-document";

describe("Gemini document extraction", () => {
  it("requests literal document text without analysis or markdown", () => {
    expect(buildGeminiDocumentPrompt({ mimeType: "application/pdf" })).toContain(
      "Return plain text only",
    );
  });
});
