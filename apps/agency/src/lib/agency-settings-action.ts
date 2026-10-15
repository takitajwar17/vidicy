import type { TAnyZodSafeFunctionHandler } from "zsa";

// zsa-react expects an error tuple; a rejected transport leaves its pending state set.
export function withSettingsConnectionError<TAction extends TAnyZodSafeFunctionHandler>(
  action: TAction,
): TAction {
  return (async (input: Parameters<TAction>[0]) => {
    try {
      return await action(input);
    } catch {
      return [
        null,
        {
          name: "ZSAError",
          code: "ERROR",
          message: "The request failed. Check the page before you try again.",
        },
      ];
    }
  }) as TAction;
}
