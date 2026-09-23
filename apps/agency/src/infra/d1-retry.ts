const RETRYABLE_D1_ERROR_SNIPPETS = [
  "Network connection lost",
  "storage caused object to be reset",
  "caused object to be reset",
  "reset because its code was updated",
] as const;

const UNIQUE_CONSTRAINT_ERROR_SNIPPETS = [
  "UNIQUE constraint failed",
  "unique constraint failed",
  "constraint failed: UNIQUE",
] as const;

function collectErrorMessages({
  error,
  seen = new Set<unknown>(),
}: {
  error: unknown;
  seen?: Set<unknown>;
}): string[] {
  if (error == null) {
    return [];
  }

  if (typeof error === "string") {
    return [error];
  }

  if (typeof error !== "object") {
    return [];
  }

  if (seen.has(error)) {
    return [];
  }
  seen.add(error);

  const messages: string[] = [];
  const record = error as {
    message?: unknown;
    cause?: unknown;
    errors?: unknown;
  };

  if (typeof record.message === "string" && record.message.length > 0) {
    messages.push(record.message);
  }

  if (Array.isArray(record.errors)) {
    for (const nestedError of record.errors) {
      messages.push(...collectErrorMessages({ error: nestedError, seen }));
    }
  }

  if (record.cause !== undefined) {
    messages.push(...collectErrorMessages({ error: record.cause, seen }));
  }

  return messages;
}

function sleep({
  ms,
}: {
  ms: number;
}) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRetryableD1WriteError({
  error,
}: {
  error: unknown;
}) {
  return collectErrorMessages({ error }).some((message) =>
    RETRYABLE_D1_ERROR_SNIPPETS.some((snippet) => message.includes(snippet)),
  );
}

export function isUniqueConstraintError({
  error,
}: {
  error: unknown;
}) {
  return collectErrorMessages({ error }).some((message) =>
    UNIQUE_CONSTRAINT_ERROR_SNIPPETS.some((snippet) => message.includes(snippet)),
  );
}

export async function retryD1Write<T>({
  operation,
  maxAttempts = 3,
  baseDelayMs = 100,
}: {
  operation: () => Promise<T>;
  maxAttempts?: number;
  baseDelayMs?: number;
}): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableD1WriteError({ error })) {
        throw error;
      }

      await sleep({
        ms: baseDelayMs * 2 ** (attempt - 1),
      });
      attempt += 1;
    }
  }
}
