export interface ReviewCalculationPeriod {
  startDate: string;
  endDate: string;
}
export interface ReviewCalculationFx {
  fromCurrency: string;
  toCurrency: string;
  rateDate: string;
  sourceIds: readonly string[];
}
export interface ReviewCalculationMetadata {
  unit: string;
  currency: string | null;
  period: ReviewCalculationPeriod | null;
  sourceDate: string;
  sourceIds: readonly string[];
  fx?: ReviewCalculationFx;
}
export interface ReviewCalculationEvidence {
  documentId: string;
  page?: number;
  field?: string;
}
export interface ReviewCalculationNumericValue {
  value: string;
  metadata: ReviewCalculationMetadata;
}
export type ReviewCalculationExpression =
  | { op: "constant"; value: string; metadata: ReviewCalculationMetadata }
  | { op: "fact"; fact: string }
  | {
      op: "add" | "subtract" | "multiply" | "divide";
      left: ReviewCalculationExpression;
      right: ReviewCalculationExpression;
      metadata: ReviewCalculationMetadata;
    };
export interface ReviewCalculation {
  id: string;
  sourceIds: readonly string[];
  sourceDate: string;
  expression: ReviewCalculationExpression;
  output: {
    scale: number;
    rounding: "floor" | "ceil" | "half_up";
    unit: string;
    currency: string | null;
    period: ReviewCalculationPeriod | null;
  };
}
export interface ReviewCalculationTrace {
  path: string;
  operation: string;
  status: "calculated" | "unresolved";
  rational: { numerator: string; denominator: string } | null;
  metadata: ReviewCalculationMetadata | null;
  sourceIds: string[];
  evidence: ReviewCalculationEvidence[];
  reason?: string;
  value?: string;
  rounding?: { scale: number; mode: "floor" | "ceil" | "half_up" };
}
export interface ReviewCalculationResult {
  status: "calculated" | "unresolved";
  value: string | null;
  unit: string | null;
  currency: string | null;
  period: ReviewCalculationPeriod | null;
  metadata: ReviewCalculationMetadata | null;
  trace: ReviewCalculationTrace[];
  sourceIds: string[];
  evidence: ReviewCalculationEvidence[];
}

interface Rational {
  numerator: bigint;
  denominator: bigint;
}
interface NodeValue {
  rational: Rational;
  metadata: ReviewCalculationMetadata;
  evidence: ReviewCalculationEvidence[];
}
const MAX_DECIMAL_DIGITS = 1024;
const MAX_INTERMEDIATE_DIGITS = 4096;
const MAX_NODES = 512;
const MAX_DEPTH = 64;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function date(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function identifiers(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function period(value: unknown): value is ReviewCalculationPeriod | null {
  return (
    value === null ||
    (record(value) &&
      date(value.startDate) &&
      date(value.endDate) &&
      value.startDate <= value.endDate)
  );
}
function dimensions(value: unknown): value is Record<string, unknown> & {
  unit: string;
  currency: string | null;
  period: ReviewCalculationPeriod | null;
} {
  return (
    record(value) &&
    text(value.unit) &&
    (value.currency === null || text(value.currency)) &&
    period(value.period)
  );
}
function readMetadata(value: unknown): ReviewCalculationMetadata | null {
  if (
    !record(value) ||
    !dimensions(value) ||
    !date(value.sourceDate) ||
    !identifiers(value.sourceIds)
  )
    return null;
  if (
    value.fx !== undefined &&
    (!record(value.fx) ||
      !text(value.fx.fromCurrency) ||
      !text(value.fx.toCurrency) ||
      !date(value.fx.rateDate) ||
      !identifiers(value.fx.sourceIds) ||
      value.fx.sourceIds.length === 0)
  )
    return null;
  const validated = value as unknown as ReviewCalculationMetadata;
  return {
    unit: validated.unit,
    currency: validated.currency,
    period: validated.period ? { ...validated.period } : null,
    sourceDate: validated.sourceDate,
    sourceIds: [...validated.sourceIds],
    ...(validated.fx ? { fx: { ...validated.fx, sourceIds: [...validated.fx.sourceIds] } } : {}),
  };
}
function samePeriod(
  left: ReviewCalculationPeriod | null,
  right: ReviewCalculationPeriod | null,
): boolean {
  return left === null
    ? right === null
    : right !== null && left.startDate === right.startDate && left.endDate === right.endDate;
}
function sameDimensions(
  left: Pick<ReviewCalculationMetadata, "unit" | "currency" | "period">,
  right: Pick<ReviewCalculationMetadata, "unit" | "currency" | "period">,
): boolean {
  return (
    left.unit === right.unit &&
    left.currency === right.currency &&
    samePeriod(left.period, right.period)
  );
}
function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function rational(numerator: bigint, denominator: bigint): Rational {
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator / divisor) * sign, denominator: (denominator / divisor) * sign };
}
function decimal(value: unknown): Rational | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_DECIMAL_DIGITS ||
    !/^[+-]?\d+(?:\.\d+)?$/.test(value)
  )
    return null;
  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  return rational(BigInt(whole + fraction) * (negative ? -1n : 1n), 10n ** BigInt(fraction.length));
}
export function compareReviewDecimals({
  left,
  right,
}: {
  left: string;
  right: string;
}): -1 | 0 | 1 | null {
  const a = decimal(left);
  const b = decimal(right);
  if (!a || !b) return null;
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
function uniqueEvidence(items: ReviewCalculationEvidence[]): ReviewCalculationEvidence[] {
  return [
    ...new Map(
      items.map((item) => [JSON.stringify([item.documentId, item.page, item.field]), item]),
    ).values(),
  ];
}
function readEvidence(value: unknown): ReviewCalculationEvidence[] | null {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !record(entry) ||
        !text(entry.documentId) ||
        (entry.page !== undefined &&
          (!Number.isInteger(entry.page) || (entry.page as number) < 1)) ||
        (entry.field !== undefined && !text(entry.field)),
    )
  )
    return null;
  return (value as ReviewCalculationEvidence[]).map((entry) => ({
    documentId: entry.documentId,
    ...(entry.page !== undefined ? { page: entry.page } : {}),
    ...(entry.field !== undefined ? { field: entry.field } : {}),
  }));
}
function factAt(facts: Record<string, unknown>, path: unknown): unknown {
  if (
    !text(path) ||
    path
      .split(".")
      .some((part) => !part || ["__proto__", "constructor", "prototype"].includes(part))
  )
    return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) => (record(value) && Object.hasOwn(value, key) ? value[key] : undefined),
      facts,
    );
}
function fxMatches(left: ReviewCalculationFx, right: ReviewCalculationFx): boolean {
  return (
    left.fromCurrency === right.fromCurrency &&
    left.toCurrency === right.toCurrency &&
    left.rateDate === right.rateDate &&
    [...new Set(left.sourceIds)].sort().join("\n") ===
      [...new Set(right.sourceIds)].sort().join("\n")
  );
}
function validCurrencyOperation(
  op: "multiply" | "divide",
  left: NodeValue,
  right: NodeValue,
  output: ReviewCalculationMetadata,
): boolean {
  const a = left.metadata;
  const b = right.metadata;
  if (op === "multiply" && a.currency !== null && b.currency !== null) return false;
  if (op === "divide" && b.currency !== null)
    return a.currency === b.currency && output.currency === null;
  const money = a.currency !== null ? left : b.currency !== null ? right : null;
  if (!money) return output.currency === null;
  if (money.metadata.currency === output.currency) return true;
  const rate = money === left ? right : left;
  const fx = rate.metadata.fx;
  if (
    !output.fx ||
    !fx ||
    !fxMatches(output.fx, fx) ||
    rate.metadata.unit !== "exchange_rate" ||
    rate.metadata.currency !== null ||
    rate.rational.numerator <= 0n ||
    output.unit !== money.metadata.unit ||
    !samePeriod(output.period, money.metadata.period)
  )
    return false;
  return op === "multiply"
    ? fx.fromCurrency === money.metadata.currency && fx.toCurrency === output.currency
    : money === left &&
        fx.fromCurrency === output.currency &&
        fx.toCurrency === money.metadata.currency;
}
function round(value: Rational, scale: number, mode: "floor" | "ceil" | "half_up"): string {
  const negative = value.numerator < 0n;
  const absolute = (negative ? -value.numerator : value.numerator) * 10n ** BigInt(scale);
  let integer = absolute / value.denominator;
  const remainder = absolute % value.denominator;
  if (
    (mode === "floor" && negative && remainder !== 0n) ||
    (mode === "ceil" && !negative && remainder !== 0n) ||
    (mode === "half_up" && remainder * 2n >= value.denominator)
  )
    integer += 1n;
  const digits = integer.toString().padStart(scale + 1, "0");
  return `${negative && integer !== 0n ? "-" : ""}${scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`}`;
}

/** Source-defined arithmetic only. This function does not approve sources or legal policy. */
export function calculateReviewValue({
  calculation,
  facts,
}: {
  calculation: ReviewCalculation;
  facts: Record<string, unknown>;
}): ReviewCalculationResult {
  const trace: ReviewCalculationTrace[] = [];
  const sourceIds = new Set<string>();
  const evidence: ReviewCalculationEvidence[] = [];
  const active = new Set<object>();
  let nodes = 0;
  function addSources(meta: ReviewCalculationMetadata | null) {
    for (const id of [...(meta?.sourceIds ?? []), ...(meta?.fx?.sourceIds ?? [])])
      sourceIds.add(id);
  }
  function unresolved(
    path: string,
    operation: string,
    reason: string,
    meta: ReviewCalculationMetadata | null = null,
    refs: ReviewCalculationEvidence[] = [],
  ): null {
    addSources(meta);
    evidence.push(...refs);
    trace.push({
      path,
      operation,
      status: "unresolved",
      rational: null,
      metadata: meta,
      sourceIds: [...new Set([...(meta?.sourceIds ?? []), ...(meta?.fx?.sourceIds ?? [])])],
      evidence: refs,
      reason,
    });
    return null;
  }
  function append(path: string, operation: string, value: NodeValue): NodeValue {
    addSources(value.metadata);
    evidence.push(...value.evidence);
    trace.push({
      path,
      operation,
      status: "calculated",
      rational: {
        numerator: value.rational.numerator.toString(),
        denominator: value.rational.denominator.toString(),
      },
      metadata: value.metadata,
      sourceIds: [
        ...new Set([...value.metadata.sourceIds, ...(value.metadata.fx?.sourceIds ?? [])]),
      ],
      evidence: value.evidence,
    });
    return value;
  }
  function visit(expression: unknown, path: string, depth: number): NodeValue | null {
    if (!record(expression)) return unresolved(path, "unknown", "invalid_expression");
    const op = typeof expression.op === "string" ? expression.op : "unknown";
    if (active.has(expression)) return unresolved(path, op, "expression_cycle");
    if (++nodes > MAX_NODES || depth > MAX_DEPTH)
      return unresolved(path, op, "expression_size_limit");
    active.add(expression);
    try {
      if (op === "fact") {
        const input = factAt(facts, expression.fact);
        const refs = record(input) ? readEvidence(input.evidence) : [];
        const numeric = record(input) && record(input.value) ? input.value : null;
        const meta = numeric ? readMetadata(numeric.metadata) : null;
        if (!record(input) || input.state !== "confirmed")
          return unresolved(path, op, "fact_not_confirmed", meta, refs ?? []);
        if (!refs) return unresolved(path, op, "invalid_evidence_reference", meta);
        const value = numeric ? decimal(numeric.value) : null;
        if (!meta || !value) return unresolved(path, op, "invalid_numeric_fact", meta, refs);
        return append(path, op, { rational: value, metadata: meta, evidence: refs });
      }
      if (op === "constant") {
        const meta = readMetadata(expression.metadata);
        const value = decimal(expression.value);
        return meta && value
          ? append(path, op, { rational: value, metadata: meta, evidence: [] })
          : unresolved(path, op, "invalid_constant", meta);
      }
      if (!["add", "subtract", "multiply", "divide"].includes(op))
        return unresolved(path, op, "unknown_operator");
      const left = visit(expression.left, `${path}.left`, depth + 1);
      const right = visit(expression.right, `${path}.right`, depth + 1);
      const meta = readMetadata(expression.metadata);
      if (!left || !right || !meta)
        return unresolved(path, op, "unresolved_operand_or_metadata", meta);
      const refs = uniqueEvidence([...left.evidence, ...right.evidence]);
      if (
        (op === "add" || op === "subtract") &&
        (!sameDimensions(left.metadata, right.metadata) || !sameDimensions(left.metadata, meta))
      )
        return unresolved(path, op, "unit_currency_or_period_mismatch", meta, refs);
      if ((op === "multiply" || op === "divide") && !validCurrencyOperation(op, left, right, meta))
        return unresolved(path, op, "currency_or_fx_mismatch", meta, refs);
      const a = left.rational;
      const b = right.rational;
      if (op === "divide" && b.numerator === 0n)
        return unresolved(path, op, "division_by_zero", meta, refs);
      const value =
        op === "add"
          ? rational(
              a.numerator * b.denominator + b.numerator * a.denominator,
              a.denominator * b.denominator,
            )
          : op === "subtract"
            ? rational(
                a.numerator * b.denominator - b.numerator * a.denominator,
                a.denominator * b.denominator,
              )
            : op === "multiply"
              ? rational(a.numerator * b.numerator, a.denominator * b.denominator)
              : rational(a.numerator * b.denominator, a.denominator * b.numerator);
      if (
        value.numerator.toString().length > MAX_INTERMEDIATE_DIGITS ||
        value.denominator.toString().length > MAX_INTERMEDIATE_DIGITS
      )
        return unresolved(path, op, "arithmetic_size_limit", meta, refs);
      return append(path, op, { rational: value, metadata: meta, evidence: refs });
    } finally {
      active.delete(expression);
    }
  }
  const config = record(calculation) ? calculation : null;
  const output = config && record(config.output) ? config.output : null;
  const outputValid =
    output &&
    dimensions(output) &&
    Number.isInteger(output.scale) &&
    (output.scale as number) >= 0 &&
    (output.scale as number) <= MAX_DECIMAL_DIGITS &&
    ["floor", "ceil", "half_up"].includes(output.rounding as string);
  const configValid =
    config &&
    text(config.id) &&
    identifiers(config.sourceIds) &&
    config.sourceIds.length > 0 &&
    date(config.sourceDate) &&
    outputValid &&
    record(facts);
  if (config && identifiers(config.sourceIds)) for (const id of config.sourceIds) sourceIds.add(id);
  let value: string | null = null;
  let meta: ReviewCalculationMetadata | null = null;
  if (!configValid || !config || !output)
    unresolved("$", "configuration", "invalid_calculation_configuration");
  else {
    const evaluated = visit(config.expression, "$", 0);
    if (
      evaluated &&
      !sameDimensions(evaluated.metadata, output as unknown as ReviewCalculationMetadata)
    )
      unresolved("$", "round", "output_dimension_mismatch");
    else if (evaluated) {
      value = round(
        evaluated.rational,
        output.scale as number,
        output.rounding as "floor" | "ceil" | "half_up",
      );
      meta = {
        unit: output.unit as string,
        currency: output.currency as string | null,
        period: output.period === null ? null : { ...(output.period as ReviewCalculationPeriod) },
        sourceDate: config.sourceDate as string,
        sourceIds: [...sourceIds],
        ...(evaluated.metadata.fx ? { fx: evaluated.metadata.fx } : {}),
      };
      trace.push({
        path: "$",
        operation: "round",
        status: "calculated",
        rational: {
          numerator: evaluated.rational.numerator.toString(),
          denominator: evaluated.rational.denominator.toString(),
        },
        metadata: meta,
        sourceIds: [...sourceIds],
        evidence: uniqueEvidence(evidence),
        value,
        rounding: {
          scale: output.scale as number,
          mode: output.rounding as "floor" | "ceil" | "half_up",
        },
      });
    }
  }
  return {
    status: value === null ? "unresolved" : "calculated",
    value,
    unit: meta?.unit ?? null,
    currency: meta?.currency ?? null,
    period: meta?.period ?? null,
    metadata: meta,
    trace,
    sourceIds: [...sourceIds],
    evidence: uniqueEvidence(evidence),
  };
}
