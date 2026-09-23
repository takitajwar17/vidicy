type VectorizeQueryMatch = {
  metadata?: {
    applicationId?: string;
    content?: string;
    documentId?: string;
  } | null;
};

type VectorizeQueryResult = {
  matches: VectorizeQueryMatch[];
};

type VectorizeQueryOptions = {
  filter?: Record<string, string>;
  returnMetadata: "all";
  topK: number;
};

export interface VectorizeQueryClient {
  query(queryVector: number[], options: VectorizeQueryOptions): Promise<VectorizeQueryResult>;
}

const DIRECT_DOCUMENT_TOP_K = 6;
const APPLICATION_FALLBACK_TOP_K = 24;

function extractChunks(
  matches: VectorizeQueryMatch[],
  documentId?: string,
): string[] {
  return matches
    .filter((match) => {
      if (!documentId) return true;
      return match.metadata?.documentId === documentId;
    })
    .map((match) => match.metadata?.content ?? "")
    .filter((content) => content.length > 0);
}

export async function queryDocumentChunksFromVectorize({
  applicationId,
  documentId,
  queryVector,
  vectorize,
}: {
  applicationId: string;
  documentId: string;
  queryVector: number[];
  vectorize: VectorizeQueryClient;
}): Promise<string[]> {
  try {
    const directResult = await vectorize.query(queryVector, {
      topK: DIRECT_DOCUMENT_TOP_K,
      filter: { documentId },
      returnMetadata: "all",
    });

    const directChunks = extractChunks(directResult.matches);
    if (directChunks.length > 0) {
      return directChunks;
    }
  } catch {
    // Fall through to the application-scoped fallback below. This keeps retrieval
    // working when the documentId metadata index has not been provisioned yet.
  }

  const applicationResult = await vectorize.query(queryVector, {
    topK: APPLICATION_FALLBACK_TOP_K,
    filter: { applicationId },
    returnMetadata: "all",
  });

  return extractChunks(applicationResult.matches, documentId);
}
