const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function isSqlQueryLoggingEnabled(
  nodeEnv: string | undefined,
  rawOverride: string | undefined,
): boolean {
  const normalized = rawOverride?.trim().toLowerCase();

  if (normalized && TRUE_VALUES.has(normalized)) return true;
  if (normalized && FALSE_VALUES.has(normalized)) return false;

  return nodeEnv !== "production";
}
