export const GEMINI_DOCUMENT_EMPTY_SENTINEL = "NO_EXTRACTABLE_TEXT";

export function buildGeminiDocumentPrompt({
  mimeType,
}: {
  mimeType: "application/pdf" | `image/${string}`;
}): string {
  if (mimeType === "application/pdf") {
    return (
      "Extract all readable text from this PDF. " +
      "Preserve original wording, numbers, dates, and line breaks where possible. " +
      "Return plain text only, with no markdown or explanation. " +
      `If nothing is readable, return exactly: ${GEMINI_DOCUMENT_EMPTY_SENTINEL}`
    );
  }

  return (
    "Describe exactly everything visible in the image before extracting text, " +
    "without guessing intent, purpose, document type, or context. " +
    "Be literal and exhaustive, and note uncertainty when something is unclear. " +
    "Then extract all readable text. Preserve original wording, numbers, dates, " +
    "and line breaks where possible. Return plain text only, no markdown, in this format:\n" +
    "IMAGE_DESCRIPTION: <exact visual description>\n" +
    "READABLE_TEXT:\n<verbatim extracted text>\n" +
    `If there is no readable text, still provide IMAGE_DESCRIPTION, then write exactly ${GEMINI_DOCUMENT_EMPTY_SENTINEL} on the next line.`
  );
}
