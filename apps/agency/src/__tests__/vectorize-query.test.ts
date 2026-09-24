import { describe, expect, it, vi } from "vitest";

import { queryDocumentChunksFromVectorize } from "@/lib/vectorize-query";

describe("queryDocumentChunksFromVectorize", () => {
  it("falls back to an application-scoped query when the documentId filter returns no matches", async () => {
    const vectorize = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ matches: [] })
        .mockResolvedValueOnce({
          matches: [
            {
              metadata: {
                documentId: "doc_target",
                applicationId: "app_123",
                content: "target chunk",
              },
            },
            {
              metadata: {
                documentId: "doc_other",
                applicationId: "app_123",
                content: "other chunk",
              },
            },
          ],
        }),
    };

    const chunks = await queryDocumentChunksFromVectorize({
      vectorize,
      queryVector: [0.1, 0.2, 0.3],
      applicationId: "app_123",
      documentId: "doc_target",
    });

    expect(chunks).toEqual(["target chunk"]);
    expect(vectorize.query).toHaveBeenNthCalledWith(1, [0.1, 0.2, 0.3], {
      topK: 6,
      filter: { documentId: "doc_target" },
      returnMetadata: "all",
    });
    expect(vectorize.query).toHaveBeenNthCalledWith(2, [0.1, 0.2, 0.3], {
      topK: 24,
      filter: { applicationId: "app_123" },
      returnMetadata: "all",
    });
  });

  it("keeps the direct documentId path when it returns matches", async () => {
    const vectorize = {
      query: vi.fn().mockResolvedValue({
        matches: [
          {
            metadata: {
              documentId: "doc_target",
              applicationId: "app_123",
              content: "target chunk",
            },
          },
        ],
      }),
    };

    const chunks = await queryDocumentChunksFromVectorize({
      vectorize,
      queryVector: [0.1, 0.2, 0.3],
      applicationId: "app_123",
      documentId: "doc_target",
    });

    expect(chunks).toEqual(["target chunk"]);
    expect(vectorize.query).toHaveBeenCalledTimes(1);
  });
});
