import { describe, expect, it } from "vitest";
import {
  calculateReviewValue,
  compareReviewDecimals,
  type ReviewCalculation,
  type ReviewCalculationExpression,
  type ReviewCalculationMetadata,
} from "@/lib/review-calculations";

function metadata(overrides: Partial<ReviewCalculationMetadata> = {}): ReviewCalculationMetadata {
  return {
    unit: "money",
    currency: "CAD",
    period: null,
    sourceDate: "2026-10-22",
    sourceIds: ["numeric-source"],
    ...overrides,
  };
}
function constant(value: string, dimensions = metadata()): ReviewCalculationExpression {
  return { op: "constant", value, metadata: dimensions };
}
function operation(
  op: "add" | "subtract" | "multiply" | "divide",
  left: ReviewCalculationExpression,
  right: ReviewCalculationExpression,
  dimensions = metadata(),
): ReviewCalculationExpression {
  return { op, left, right, metadata: dimensions };
}
function calculation(
  expression: ReviewCalculationExpression,
  overrides: Partial<ReviewCalculation> = {},
): ReviewCalculation {
  return {
    id: "calculatedFunds",
    sourceIds: ["formula-source"],
    sourceDate: "2026-10-22",
    expression,
    output: { scale: 2, rounding: "half_up", unit: "money", currency: "CAD", period: null },
    ...overrides,
  };
}
function run(
  expression: ReviewCalculationExpression,
  facts: Record<string, unknown> = {},
  overrides: Partial<ReviewCalculation> = {},
) {
  return calculateReviewValue({ calculation: calculation(expression, overrides), facts });
}
function fact(value: string, dimensions = metadata(), state = "confirmed") {
  return {
    state,
    value: { value, metadata: dimensions },
    evidence: [{ documentId: "document-1", page: 2, field: "balance" }],
  };
}
const scalar = metadata({ unit: "ratio", currency: null });

describe("exact review arithmetic", () => {
  it("adds decimal strings without floating-point error", () => {
    expect(run(operation("add", constant("0.1"), constant("0.2"))).value).toBe("0.30");
  });

  it("keeps fractional intermediates exact and rounds only the output", () => {
    const result = run(
      operation(
        "multiply",
        operation("divide", constant("1"), constant("3", scalar)),
        constant("3", scalar),
      ),
    );
    expect(result.status).toBe("calculated");
    expect(result.value).toBe("1.00");
    expect(result.trace.find((step) => step.operation === "divide")?.rational).toEqual({
      numerator: "1",
      denominator: "3",
    });
  });

  it("preserves values above the JavaScript safe integer range", () => {
    expect(run(operation("add", constant("9007199254740993.99"), constant("0.01"))).value).toBe(
      "9007199254740994.00",
    );
  });

  it.each([
    ["1.235", "floor", "1.23"],
    ["1.235", "ceil", "1.24"],
    ["1.235", "half_up", "1.24"],
    ["-1.235", "floor", "-1.24"],
    ["-1.235", "ceil", "-1.23"],
    ["-1.235", "half_up", "-1.24"],
    ["1.234", "half_up", "1.23"],
    ["-0.001", "ceil", "0.00"],
    ["-0.001", "floor", "-0.01"],
  ] as const)("rounds %s with the explicit %s rule", (value, rounding, expected) => {
    expect(
      run(
        constant(value),
        {},
        { output: { scale: 2, rounding, unit: "money", currency: "CAD", period: null } },
      ).value,
    ).toBe(expected);
  });

  it("permits a shared acyclic expression", () => {
    const shared = constant("2");
    expect(run(operation("add", shared, shared)).value).toBe("4.00");
  });

  it("subtracts confirmed zero instead of treating it as unknown", () => {
    expect(
      run(operation("subtract", constant("10"), { op: "fact", fact: "paid" }), { paid: fact("0") })
        .value,
    ).toBe("10.00");
  });

  it("keeps the source-defined unit and period without inventing conversions", () => {
    const period = { startDate: "2026-01-01", endDate: "2026-12-31" };
    const yearly = metadata({ period });
    const result = run(
      operation("multiply", constant("100", metadata()), constant("12", scalar), yearly),
      {},
      { output: { scale: 2, rounding: "floor", unit: "money", currency: "CAD", period } },
    );
    expect(result.value).toBe("1200.00");
    expect(result.period).toEqual(period);
    expect(result.metadata?.sourceDate).toBe("2026-10-22");
  });
});

describe("calculation trust boundaries", () => {
  it.each(["declared", "extracted", "conflicting", "missing"])(
    "does not use %s numeric facts",
    (state) => {
      const result = run({ op: "fact", fact: "funds" }, { funds: fact("500", metadata(), state) });
      expect(result.status).toBe("unresolved");
      expect(result.value).toBeNull();
      expect(result.trace.some((entry) => entry.reason)).toBe(true);
    },
  );

  it("does not turn absent facts into zero", () => {
    expect(run(operation("add", constant("10"), { op: "fact", fact: "unknown" })).status).toBe(
      "unresolved",
    );
  });

  it.each(["1e3", "NaN", "Infinity", "0x10", "1,000", "", " "])(
    "rejects a non-decimal numeric string: %s",
    (value) => {
      expect(run(constant(value)).status).toBe("unresolved");
    },
  );

  it("does not silently accept JavaScript numbers as exact decimal strings", () => {
    expect(run(constant(0.1 as unknown as string)).status).toBe("unresolved");
  });

  it("rejects division by zero", () => {
    expect(run(operation("divide", constant("5"), constant("0", scalar))).status).toBe(
      "unresolved",
    );
  });

  it("rejects an unknown operator instead of selecting an arithmetic fallback", () => {
    const expression = {
      op: "unexpected",
      left: constant("1"),
      right: constant("2"),
      metadata: metadata(),
    } as unknown as ReviewCalculationExpression;
    expect(run(expression).status).toBe("unresolved");
  });

  it("rejects expression cycles", () => {
    const expression = operation("add", constant("1"), constant("2")) as Extract<
      ReviewCalculationExpression,
      { left: unknown }
    >;
    expression.left = expression;
    const result = run(expression);
    expect(result.status).toBe("unresolved");
    expect(result.trace.some((step) => step.reason?.includes("cycle"))).toBe(true);
  });

  it.each(["unit", "currency", "period"] as const)(
    "requires matching %s for addition and subtraction",
    (key) => {
      const changed = metadata({
        [key]:
          key === "unit"
            ? "hours"
            : key === "currency"
              ? "USD"
              : { startDate: "2026-01-01", endDate: "2026-12-31" },
      });
      for (const op of ["add", "subtract"] as const) {
        expect(run(operation(op, constant("1"), constant("2", changed))).status).toBe("unresolved");
      }
    },
  );

  it("rejects output dimensions that differ from the evaluated expression", () => {
    expect(
      run(
        constant("1"),
        {},
        { output: { scale: 2, rounding: "floor", unit: "money", currency: "USD", period: null } },
      ).status,
    ).toBe("unresolved");
  });

  it.each(["unit", "currency", "period", "sourceDate", "sourceIds"])(
    "requires explicit input metadata: %s",
    (key) => {
      const incomplete = { ...metadata() } as Record<string, unknown>;
      delete incomplete[key];
      expect(run(constant("1", incomplete as unknown as ReviewCalculationMetadata)).status).toBe(
        "unresolved",
      );
    },
  );

  it.each(["scale", "rounding", "unit", "currency", "period"])(
    "requires an explicit output rule: %s",
    (key) => {
      const config = calculation(constant("1"));
      delete (config.output as unknown as Record<string, unknown>)[key];
      expect(calculateReviewValue({ calculation: config, facts: {} }).status).toBe("unresolved");
    },
  );

  it("rejects missing and invalid source or period dates", () => {
    expect(run(constant("1"), {}, { sourceDate: "2026-02-30" }).status).toBe("unresolved");
    expect(
      run(constant("1", metadata({ period: { startDate: "2026-10-22", endDate: "2026-01-01" } })))
        .status,
    ).toBe("unresolved");
  });

  it("does not accept prototype paths as confirmed inputs", () => {
    expect(run({ op: "fact", fact: "__proto__.funds" }).status).toBe("unresolved");
  });
});

describe("explicit FX and provenance", () => {
  const fx = {
    fromCurrency: "CAD",
    toCurrency: "USD",
    rateDate: "2026-10-21",
    sourceIds: ["fx-source"],
  };
  const usd = metadata({ currency: "USD", fx });
  const rate = metadata({
    unit: "exchange_rate",
    currency: null,
    sourceDate: "2026-10-21",
    sourceIds: ["fx-source"],
    fx,
  });

  it("converts only with a confirmed rate and explicit matching FX metadata", () => {
    const expression = operation(
      "multiply",
      { op: "fact", fact: "funds" },
      { op: "fact", fact: "rate" },
      usd,
    );
    const result = run(
      expression,
      { funds: fact("100"), rate: fact("0.75", rate) },
      { output: { scale: 2, rounding: "half_up", unit: "money", currency: "USD", period: null } },
    );
    expect(result.value).toBe("75.00");
    expect(result.currency).toBe("USD");
    expect(result.trace.find((step) => step.operation === "multiply")?.metadata?.fx).toEqual(fx);
  });

  it("does not infer FX from a bare numeric multiplier", () => {
    const result = run(
      operation("multiply", constant("100"), constant("0.75", scalar), usd),
      {},
      { output: { scale: 2, rounding: "half_up", unit: "money", currency: "USD", period: null } },
    );
    expect(result.status).toBe("unresolved");
  });

  it("does not substitute an unconfirmed or differently dated FX rate", () => {
    const expression = operation("multiply", constant("100"), { op: "fact", fact: "rate" }, usd);
    for (const supplied of [
      fact("0.75", rate, "declared"),
      fact("0.75", { ...rate, fx: { ...fx, rateDate: "2026-10-20" } }),
    ]) {
      expect(
        run(
          expression,
          { rate: supplied },
          {
            output: { scale: 2, rounding: "half_up", unit: "money", currency: "USD", period: null },
          },
        ).status,
      ).toBe("unresolved");
    }
  });

  it("requires consistent currency for money division", () => {
    const same = run(
      operation("divide", constant("100"), constant("50"), scalar),
      {},
      { output: { scale: 2, rounding: "half_up", unit: "ratio", currency: null, period: null } },
    );
    expect(same.value).toBe("2.00");
    const different = run(
      operation("divide", constant("100"), constant("50", usd), scalar),
      {},
      { output: { scale: 2, rounding: "half_up", unit: "ratio", currency: null, period: null } },
    );
    expect(different.status).toBe("unresolved");
  });

  it("allows money division after an explicit exact FX conversion", () => {
    const inverse = {
      fromCurrency: "USD",
      toCurrency: "CAD",
      rateDate: "2026-10-21",
      sourceIds: ["fx-source"],
    };
    const converted = operation(
      "multiply",
      constant("80", usd),
      constant("1.25", { ...rate, fx: inverse }),
      metadata({ fx: inverse }),
    );
    const result = run(
      operation("divide", constant("100"), converted, scalar),
      {},
      { output: { scale: 2, rounding: "half_up", unit: "ratio", currency: null, period: null } },
    );
    expect(result.value).toBe("1.00");
    expect(result.sourceIds).toContain("fx-source");
  });

  it("uses the documented inverse direction when dividing by an FX rate", () => {
    const result = run(
      operation("divide", constant("75", usd), constant("0.75", rate), metadata({ fx })),
    );
    expect(result.value).toBe("100.00");
    expect(result.currency).toBe("CAD");
  });

  it("captures trace metadata and evidence independently of later input mutation", () => {
    const input = fact("100");
    const result = run({ op: "fact", fact: "funds" }, { funds: input });
    input.value.metadata.currency = "USD";
    input.evidence[0].documentId = "replacement";
    expect(result.trace[0].metadata?.currency).toBe("CAD");
    expect(result.evidence[0].documentId).toBe("document-1");
  });

  it("captures the declared output period independently of later rule mutation", () => {
    const window = { startDate: "2026-01-01", endDate: "2026-12-31" };
    const config = calculation(constant("100", metadata({ period: { ...window } })), {
      output: { scale: 2, rounding: "half_up", unit: "money", currency: "CAD", period: window },
    });
    const result = calculateReviewValue({ calculation: config, facts: {} });
    window.endDate = "2027-12-31";
    expect(result.period?.endDate).toBe("2026-12-31");
  });

  it("preserves source identifiers, exact steps and input evidence references", () => {
    const result = run(
      operation(
        "subtract",
        { op: "fact", fact: "funds" },
        constant("0.10", metadata({ sourceIds: ["deduction-source"] })),
      ),
      { funds: fact("1.00", metadata({ sourceIds: ["balance-source"] })) },
    );
    expect(result.value).toBe("0.90");
    expect(result.sourceIds).toEqual(
      expect.arrayContaining([
        "formula-source",
        "numeric-source",
        "deduction-source",
        "balance-source",
      ]),
    );
    expect(result.evidence).toEqual([{ documentId: "document-1", page: 2, field: "balance" }]);
    expect(result.trace.map((step) => step.operation)).toEqual([
      "fact",
      "constant",
      "subtract",
      "round",
    ]);
    expect(result.trace.find((step) => step.operation === "subtract")?.rational).toEqual({
      numerator: "9",
      denominator: "10",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

describe("exact decimal comparison", () => {
  it.each([
    ["0.10", "0.1", 0],
    ["9007199254740993.01", "9007199254740993.00", 1],
    ["-1.2", "-1.19", -1],
    ["-0", "0.00", 0],
    ["0.00000000000000000001", "0", 1],
  ] as const)("compares %s and %s exactly", (left, right, expected) => {
    expect(compareReviewDecimals({ left, right })).toBe(expected);
  });
  it.each(["NaN", "1e3", "", "Infinity"])("returns unknown for invalid input: %s", (left) => {
    expect(compareReviewDecimals({ left, right: "1" })).toBeNull();
  });
});
