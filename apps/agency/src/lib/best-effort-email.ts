type LoggerLike = {
  error: (message: string, context: Record<string, unknown>) => void;
};

export async function sendEmailBestEffort(input: {
  send: () => Promise<unknown>;
  logger: LoggerLike;
  message: string;
  context: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await input.send();
    return true;
  } catch (error) {
    input.logger.error(input.message, {
      ...input.context,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
