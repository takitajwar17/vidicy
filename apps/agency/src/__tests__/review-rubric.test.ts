import { describe, expect, it } from "vitest";
import { VISA_TYPES_BY_DESTINATION } from "@/app/(dashboard)/dashboard/applications/new/new-application-constants";
import {
  REVIEW_RUBRIC_VERSION,
  buildRouteAssessment,
  canSubmitRouteAssessment,
  canMarkCaseReady,
  evaluateRuleCondition,
  isRouteAssessmentCurrent,
  resolveReviewRoute,
  type ReviewRulePack,
  type ReviewRouteContext,
  type RuleCondition,
} from "@/lib/review-rubric";

const asOfDate = "2026-10-22";
const context: ReviewRouteContext = {
  destinationCountry: "Canada",
  visaType: "Express Entry",
  stage: "application",
  subtype: "CEC",
  applicationDate: asOfDate,
  facts: { nationality: "Bangladesh", applicationLocation: "Canada", authority: "IRCC" },
};
const confirmed = (value: unknown) => ({
  state: "confirmed",
  value,
  evidence: [{ documentId: "test-evidence", page: 1 }],
});

function pack(overrides: Partial<ReviewRulePack> = {}): ReviewRulePack {
  return {
    id: "test-cec",
    version: "test-1",
    routeId: resolveReviewRoute(context).id,
    status: "active",
    inventoryComplete: true,
    reviewedBy: "Test route reviewer",
    reviewedAt: "2026-10-21",
    stages: ["application"],
    subtypes: ["CEC"],
    sources: [
      {
        id: "test-source",
        url: "https://www.canada.ca/test-rule",
        authority: "IRCC",
        locator: "Test fixture provision 1",
        version: "test-edition",
        status: "active",
        effectiveFrom: "2026-01-01",
        event: "applicationDate",
        checkedAt: "2026-10-21",
        nextReviewAt: "2026-11-01",
        reviewedBy: "Test route reviewer",
      },
    ],
    criteria: [
      {
        id: "language",
        label: "Required language evidence",
        kind: "evidence",
        mandatory: true,
        sourceIds: ["test-source"],
        requirement: { op: "eq", fact: "languageEvidence", value: true },
      },
    ],
    ...overrides,
  };
}

describe("route selection", () => {
  it("accounts for each menu choice without claiming approved rule coverage", () => {
    const options = Object.entries(VISA_TYPES_BY_DESTINATION).flatMap(
      ([destinationCountry, choices]) =>
        choices.map(({ value }) => resolveReviewRoute({ destinationCountry, visaType: value })),
    );
    expect(options).toHaveLength(123);
    expect(options.every((route) => route.status === "research_draft")).toBe(true);
    expect(new Set(options.map((route) => route.id)).size).toBe(123);
  });

  it("does not treat Korea B-2 transit as a US visitor route", () => {
    const route = resolveReviewRoute({
      destinationCountry: "South Korea",
      visaType: "B-2 Transit",
    });
    expect(route.family).toBe("transit");
    expect(route.id).not.toBe(
      resolveReviewRoute({ destinationCountry: "United States", visaType: "B1/B2 Visitor" }).id,
    );
  });

  it("does not guess unknown country or free-text route aliases", () => {
    expect(
      resolveReviewRoute({ destinationCountry: "Canada", visaType: "Express Entry visitor" })
        .status,
    ).toBe("unresolved");
    expect(resolveReviewRoute({ destinationCountry: "Other", visaType: "Student" }).status).toBe(
      "unresolved",
    );
  });

  it("keeps permanent residence separate from temporary return-intent guidance", () => {
    const route = resolveReviewRoute(context);
    expect(route.family).toBe("permanent_residence");
    expect(route.guidance.join(" ")).toContain("CEC");
    expect(route.requiredFacts).toContain("subtype");
  });
});

describe("rule conditions", () => {
  it("does not turn missing or conflicting facts into zero", () => {
    const condition = { op: "gte", fact: "income", value: 10 } as const;
    expect(evaluateRuleCondition({ condition, facts: {} })).toBe("unknown");
    expect(
      evaluateRuleCondition({ condition, facts: { income: { state: "conflicting", value: 20 } } }),
    ).toBe("unknown");
    expect(evaluateRuleCondition({ condition, facts: { income: confirmed(0) } })).toBe(false);
    expect(evaluateRuleCondition({ condition, facts: { income: confirmed("20") } })).toBe(
      "unknown",
    );
  });

  it("keeps declared and extracted assertions separate from confirmed facts", () => {
    const condition = { op: "eq", fact: "licence", value: true } as const;
    for (const state of ["declared", "extracted", "missing", "conflicting"]) {
      expect(evaluateRuleCondition({ condition, facts: { licence: { state, value: true } } })).toBe(
        "unknown",
      );
    }
  });

  it("accepts a confirmed alternative without demanding all paths", () => {
    expect(
      evaluateRuleCondition({
        facts: { scholarship: confirmed(true) },
        condition: {
          op: "any",
          conditions: [
            { op: "gte", fact: "bankFunds", value: 100 },
            { op: "eq", fact: "scholarship", value: true },
          ],
        },
      }),
    ).toBe(true);
  });

  it("supports cardinality without assuming unknown branches failed", () => {
    const condition = {
      op: "at_least",
      count: 2,
      conditions: [
        { op: "eq", fact: "a", value: true },
        { op: "eq", fact: "b", value: true },
        { op: "eq", fact: "c", value: true },
      ],
    } as const;
    expect(
      evaluateRuleCondition({ condition, facts: { a: confirmed(true), b: confirmed(false) } }),
    ).toBe("unknown");
    expect(
      evaluateRuleCondition({ condition, facts: { a: confirmed(true), b: confirmed(true) } }),
    ).toBe(true);
  });

  it("checks all linked parties and does not clear an unknown child", () => {
    const condition = {
      op: "every",
      collection: "people",
      condition: { op: "eq", fact: "consent", value: true },
    } as const;
    expect(
      evaluateRuleCondition({
        condition,
        facts: { people: confirmed([{ consent: confirmed(true) }, {}]) },
      }),
    ).toBe("unknown");
    expect(evaluateRuleCondition({ condition, facts: { people: confirmed([]) } })).toBe("unknown");
  });
});

describe("assessment release and readiness", () => {
  const supportedContext = {
    ...context,
    facts: { ...context.facts, languageEvidence: confirmed(true) },
  };
  it("can clear a fully supported reviewed test pack", () => {
    const assessment = buildRouteAssessment({ context: supportedContext, asOfDate, pack: pack() });
    expect(assessment.status).toBe("ready");
    expect(canSubmitRouteAssessment(assessment)).toBe(true);
    expect(
      isRouteAssessmentCurrent({ assessment, context: supportedContext, asOfDate, pack: pack() }),
    ).toBe(true);
  });
  it.each([
    {
      label: "all",
      condition: {
        op: "all",
        conditions: [
          { op: "eq", fact: "a", value: true },
          { op: "eq", fact: "b", value: true },
        ],
      },
    },
    {
      label: "at least two",
      condition: {
        op: "at_least",
        count: 2,
        conditions: [
          { op: "eq", fact: "a", value: true },
          { op: "eq", fact: "b", value: true },
          { op: "eq", fact: "c", value: true },
        ],
      },
    },
    {
      label: "every person",
      condition: {
        op: "every",
        collection: "people",
        condition: { op: "eq", fact: "proof", value: true },
      },
    },
  ])("requires evidence for each necessary $label branch", ({ condition }) => {
    const approved = pack();
    approved.criteria[0].requirement = condition as RuleCondition;
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: {
          a: confirmed(true),
          b: { state: "confirmed", value: true },
          c: confirmed(false),
          people: confirmed([
            { proof: confirmed(true) },
            { proof: { state: "confirmed", value: true } },
          ]),
        },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("missing_evidence");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it.each([
    {
      label: "any",
      condition: {
        op: "any",
        conditions: [
          { op: "eq", fact: "a", value: true },
          { op: "eq", fact: "b", value: true },
        ],
      },
    },
    {
      label: "at least two alternatives",
      condition: {
        op: "at_least",
        count: 2,
        conditions: [
          { op: "eq", fact: "a", value: true },
          { op: "eq", fact: "b", value: true },
          { op: "eq", fact: "c", value: true },
        ],
      },
    },
    {
      label: "some person",
      condition: {
        op: "some",
        collection: "people",
        condition: { op: "eq", fact: "proof", value: true },
      },
    },
  ])("accepts complete $label evidence without demanding unused alternatives", ({ condition }) => {
    const approved = pack();
    approved.criteria[0].requirement = condition as RuleCondition;
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: {
          a: { state: "confirmed", value: true },
          b: confirmed(true),
          c: confirmed(true),
          people: confirmed([
            { proof: { state: "confirmed", value: true } },
            { proof: confirmed(true) },
          ]),
        },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("supported");
    expect(canSubmitRouteAssessment(assessment)).toBe(true);
  });

  it("does not accept partial evidence inside an otherwise true OR alternative", () => {
    const approved = pack();
    approved.criteria[0].requirement = {
      op: "any",
      conditions: [
        {
          op: "all",
          conditions: [
            { op: "eq", fact: "a", value: true },
            { op: "eq", fact: "b", value: true },
          ],
        },
        { op: "eq", fact: "c", value: true },
      ],
    };
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: { a: confirmed(true), b: { state: "confirmed", value: true }, c: confirmed(false) },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("missing_evidence");
  });

  it("records the complete false-branch proof for negated alternatives", () => {
    const approved = pack();
    approved.criteria[0].requirement = {
      op: "not",
      condition: {
        op: "any",
        conditions: [
          { op: "eq", fact: "a", value: true },
          { op: "eq", fact: "b", value: true },
        ],
      },
    };
    const complete = { ...context, facts: { a: confirmed(false), b: confirmed(false) } };
    const assessment = buildRouteAssessment({ context: complete, asOfDate, pack: approved });
    expect(assessment.criteria[0].state).toBe("supported");
    expect(assessment.criteria[0].evidence).toHaveLength(2);
    const incomplete = buildRouteAssessment({
      context: {
        ...context,
        facts: { a: confirmed(false), b: { state: "confirmed", value: false } },
      },
      asOfDate,
      pack: approved,
    });
    expect(incomplete.criteria[0].state).toBe("missing_evidence");
  });

  function numericPack(event: ReviewRulePack["sources"][number]["event"] = "applicationDate") {
    const approved = pack();
    approved.sources[0].event = event;
    approved.calculations = [
      {
        id: "funds",
        sourceIds: ["test-source"],
        sourceDate: "2026-10-01",
        expression: {
          op: "constant",
          value: "100",
          metadata: {
            unit: "money",
            currency: "CAD",
            period: null,
            sourceDate: "2026-10-01",
            sourceIds: ["test-source"],
          },
        },
        output: { scale: 2, rounding: "half_up", unit: "money", currency: "CAD", period: null },
      },
    ];
    approved.criteria[0] = {
      ...approved.criteria[0],
      kind: "eligibility",
      requirement: {
        op: "decimal_gte",
        fact: "calculations.funds",
        value: "100",
        unit: "money",
        currency: "CAD",
        period: null,
      },
    };
    return approved;
  }

  it.each(["constant", "confirmed input", "FX rate"])("rejects a future nested %s date", (kind) => {
    const approved = numericPack("asOfDate");
    const config = approved.calculations![0];
    const dimensions = {
      unit: "money",
      currency: "CAD",
      period: null,
      sourceDate: "2099-01-01",
      sourceIds: ["test-source"],
    };
    let facts: Record<string, unknown> = {};
    if (kind === "constant")
      config.expression = { op: "constant", value: "100", metadata: dimensions };
    else if (kind === "confirmed input") {
      config.expression = { op: "fact", fact: "funds" };
      facts = { funds: confirmed({ value: "100", metadata: dimensions }) };
    } else {
      const fx = {
        fromCurrency: "USD",
        toCurrency: "CAD",
        rateDate: "2099-01-01",
        sourceIds: ["test-source"],
      };
      config.expression = {
        op: "multiply",
        left: {
          op: "constant",
          value: "100",
          metadata: { ...dimensions, currency: "USD", sourceDate: "2026-10-01" },
        },
        right: {
          op: "constant",
          value: "1",
          metadata: {
            ...dimensions,
            unit: "exchange_rate",
            currency: null,
            sourceDate: "2026-10-01",
            fx,
          },
        },
        metadata: { ...dimensions, sourceDate: "2026-10-01", fx },
      };
    }
    const assessment = buildRouteAssessment({
      context: { ...context, facts },
      asOfDate,
      pack: approved,
    });
    expect(assessment.calculations[0].status).toBe("unresolved");
    expect(assessment.criteria[0].state).toBe("missing_fact");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
    expect(assessment.calculations[0].trace.length).toBeGreaterThan(0);
  });

  it.each([
    { event: "applicationDate", applicationDate: "2026-10-02", expected: false },
    { event: "asOfDate", applicationDate: "2026-10-02", expected: true },
    { event: "fact:nominationDate", applicationDate: "2026-10-22", expected: false },
  ] as const)(
    "respects the selected $event calculation cutoff",
    ({ event, applicationDate, expected }) => {
      const approved = numericPack(event);
      approved.calculations![0].expression = {
        op: "constant",
        value: "100",
        metadata: {
          unit: "money",
          currency: "CAD",
          period: null,
          sourceDate: "2026-10-10",
          sourceIds: ["test-source"],
        },
      };
      const assessment = buildRouteAssessment({
        context: {
          ...context,
          applicationDate,
          facts: { nominationDate: confirmed("2026-10-02") },
        },
        asOfDate,
        pack: approved,
      });
      expect(canSubmitRouteAssessment(assessment)).toBe(expected);
      expect(assessment.calculations[0].status).toBe(expected ? "calculated" : "unresolved");
    },
  );

  it("keeps separate source event cutoffs within one calculation", () => {
    const approved = numericPack("applicationDate");
    approved.sources.push({ ...approved.sources[0], id: "current-evidence", event: "asOfDate" });
    const config = approved.calculations![0];
    config.expression = {
      op: "add",
      left: {
        op: "constant",
        value: "50",
        metadata: {
          unit: "money",
          currency: "CAD",
          period: null,
          sourceDate: "2026-10-01",
          sourceIds: ["test-source"],
        },
      },
      right: {
        op: "constant",
        value: "50",
        metadata: {
          unit: "money",
          currency: "CAD",
          period: null,
          sourceDate: "2026-10-20",
          sourceIds: ["current-evidence"],
        },
      },
      metadata: {
        unit: "money",
        currency: "CAD",
        period: null,
        sourceDate: "2026-10-01",
        sourceIds: ["test-source"],
      },
    };
    const assessment = buildRouteAssessment({
      context: { ...context, applicationDate: "2026-10-02" },
      asOfDate,
      pack: approved,
    });
    expect(assessment.calculations[0].status).toBe("calculated");
    expect(canSubmitRouteAssessment(assessment)).toBe(true);
  });

  it("does not let empty nested source identifiers bypass the formula event cutoff", () => {
    const approved = numericPack("applicationDate");
    approved.calculations![0].expression = {
      op: "constant",
      value: "100",
      metadata: {
        unit: "money",
        currency: "CAD",
        period: null,
        sourceDate: "2026-10-20",
        sourceIds: [],
      },
    };
    const assessment = buildRouteAssessment({
      context: { ...context, applicationDate: "2026-10-02" },
      asOfDate,
      pack: approved,
    });
    expect(assessment.calculations[0].status).toBe("unresolved");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it("records exact source-defined calculations separately from the old score", () => {
    const approved = pack();
    approved.calculations = [
      {
        id: "funds",
        sourceIds: ["test-source"],
        sourceDate: "2026-10-21",
        expression: {
          op: "constant",
          value: "0.30",
          metadata: {
            unit: "money",
            currency: "CAD",
            period: null,
            sourceDate: "2026-10-21",
            sourceIds: ["test-source"],
          },
        },
        output: { scale: 2, rounding: "half_up", unit: "money", currency: "CAD", period: null },
      },
    ];
    approved.criteria[0] = {
      ...approved.criteria[0],
      kind: "eligibility",
      requirement: {
        op: "decimal_gte",
        fact: "calculations.funds",
        value: "0.30",
        unit: "money",
        currency: "CAD",
        period: null,
      },
    };
    const assessment = buildRouteAssessment({ context, asOfDate, pack: approved });
    expect(assessment.calculations[0].value).toBe("0.30");
    expect(assessment.calculations[0].trace.length).toBeGreaterThan(0);
    expect(assessment.criteria[0].state).toBe("supported");
  });
  it("keeps an unresolved official calculation unknown rather than zero", () => {
    const approved = pack();
    approved.calculations = [
      {
        id: "funds",
        sourceIds: ["test-source"],
        sourceDate: "2026-10-21",
        expression: { op: "fact", fact: "missingAmount" },
        output: { scale: 2, rounding: "half_up", unit: "money", currency: "CAD", period: null },
      },
    ];
    const assessment = buildRouteAssessment({
      context: supportedContext,
      asOfDate,
      pack: approved,
    });
    expect(assessment.calculations[0].status).toBe("unresolved");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });
  it("invalidates an active assessment when its source is suspended at the same pack version", () => {
    const approved = pack();
    const assessment = buildRouteAssessment({
      context: supportedContext,
      asOfDate,
      pack: approved,
    });
    approved.sources[0].status = "suspended";
    expect(
      isRouteAssessmentCurrent({ assessment, context: supportedContext, asOfDate, pack: approved }),
    ).toBe(false);
  });
  it("rejects an unknown condition operator instead of treating it as less-than", () => {
    expect(
      evaluateRuleCondition({
        condition: { op: "invalid_operator", fact: "amount", value: 100 } as never,
        facts: { amount: confirmed(1) },
      }),
    ).toBe("unknown");
  });
  it("does not clear a pack with broken sources even if its only criterion is optional", () => {
    const approved = pack();
    approved.criteria[0].mandatory = false;
    approved.sources = [];
    const assessment = buildRouteAssessment({
      context: supportedContext,
      asOfDate,
      pack: approved,
    });
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });
  it("does not accept a private hostname merely because it claims to be IRCC", () => {
    const approved = pack();
    approved.sources[0].url = "https://attacker.example/IRCC";
    expect(
      canSubmitRouteAssessment(
        buildRouteAssessment({ context: supportedContext, asOfDate, pack: approved }),
      ),
    ).toBe(false);
  });
  it("requires an evidence reference for a supported evidence obligation", () => {
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: { ...context.facts, languageEvidence: { state: "confirmed", value: true } },
      },
      asOfDate,
      pack: pack(),
    });
    expect(assessment.criteria[0].state).toBe("missing_evidence");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });
  it("does not use evidence from an unsuccessful alternative", () => {
    const approved = pack();
    approved.criteria[0].requirement = {
      op: "any",
      conditions: [
        { op: "eq", fact: "a", value: true },
        { op: "eq", fact: "b", value: true },
      ],
    };
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: { ...context.facts, a: { state: "confirmed", value: true }, b: confirmed(false) },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("missing_evidence");
  });
  it("does not require an exemption when the ordinary condition is supported", () => {
    const approved = pack();
    approved.criteria[0].exemption = { op: "eq", fact: "exemption", value: true };
    expect(
      buildRouteAssessment({ context: supportedContext, asOfDate, pack: approved }).criteria[0]
        .state,
    ).toBe("supported");
  });
  it("does not defer an official points eligibility condition", () => {
    const approved = pack();
    approved.criteria[0] = {
      ...approved.criteria[0],
      kind: "official_points",
      requirement: { op: "gte", fact: "points", value: 67 },
      deferral: { op: "eq", fact: "defer", value: true },
    };
    const assessment = buildRouteAssessment({
      context: {
        ...context,
        facts: { ...context.facts, points: confirmed(0), defer: confirmed(true) },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("concern");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });
  it("fails closed on incomplete stored JSON", () => {
    const malformed = {
      version: REVIEW_RUBRIC_VERSION,
      support: "active",
      status: "ready",
    } as never;
    expect(canSubmitRouteAssessment(malformed)).toBe(false);
    expect(isRouteAssessmentCurrent({ assessment: malformed, context, asOfDate })).toBe(false);
  });
  it("shows draft route review needs without false legal clearance", () => {
    const assessment = buildRouteAssessment({ context, asOfDate });
    expect(assessment.version).toBe(REVIEW_RUBRIC_VERSION);
    expect(assessment.support).toBe("research_draft");
    expect(assessment.blockers.some((item) => item.kind === "unapproved_rules")).toBe(true);
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it("requires exact approved stage and subtype", () => {
    for (const changed of [
      { ...context, subtype: "FSW" },
      { ...context, stage: "profile" },
    ]) {
      const assessment = buildRouteAssessment({ context: changed, asOfDate, pack: pack() });
      expect(assessment.support).not.toBe("active");
      expect(canSubmitRouteAssessment(assessment)).toBe(false);
    }
  });

  it("does not activate an incomplete requirement inventory", () => {
    const assessment = buildRouteAssessment({
      context,
      asOfDate,
      pack: pack({ inventoryComplete: false }),
    });
    expect(assessment.support).not.toBe("active");
  });

  it("keeps document deferral separate from the underlying eligibility condition", () => {
    const assessment = buildRouteAssessment({
      context: { ...context, facts: { ...context.facts, deferred: confirmed(true) } },
      asOfDate,
      pack: pack({
        criteria: [
          { ...pack().criteria[0], deferral: { op: "eq", fact: "deferred", value: true } },
          {
            id: "qualified",
            label: "Underlying eligibility",
            kind: "eligibility",
            mandatory: true,
            sourceIds: ["test-source"],
            requirement: { op: "eq", fact: "qualified", value: true },
          },
        ],
      }),
    });
    expect(assessment.criteria.find((item) => item.id === "language")?.state).toBe("deferred");
    expect(assessment.criteria.find((item) => item.id === "qualified")?.state).toBe("missing_fact");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it("does not let satisfied optional checks cancel missing mandatory evidence", () => {
    const assessment = buildRouteAssessment({
      context: { ...context, facts: { ...context.facts, nice: confirmed(true) } },
      asOfDate,
      pack: pack({
        criteria: [
          ...pack().criteria,
          {
            id: "nice",
            label: "Supporting evidence",
            kind: "evidence",
            mandatory: false,
            sourceIds: ["test-source"],
            requirement: { op: "eq", fact: "nice", value: true },
          },
        ],
      }),
    });
    expect(assessment.criteria.find((item) => item.id === "nice")?.state).toBe("supported");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it.each(["suspended", "conflict", "retired"] as const)(
    "blocks material source state: %s",
    (status) => {
      const approved = pack();
      approved.sources[0].status = status;
      const assessment = buildRouteAssessment({ context, asOfDate, pack: approved });
      expect(assessment.criteria[0].state).toBe("source_conflict");
      expect(canSubmitRouteAssessment(assessment)).toBe(false);
    },
  );

  it("uses the source's legal event date rather than today's date", () => {
    const approved = pack();
    approved.sources[0].effectiveFrom = "2026-10-23";
    const assessment = buildRouteAssessment({ context, asOfDate, pack: approved });
    expect(assessment.criteria[0].state).toBe("source_conflict");
  });
  it("can select a rule by a confirmed nomination date instead of the filing date", () => {
    const approved = pack();
    approved.sources[0].event = "fact:nominationDate";
    approved.sources[0].effectiveFrom = "2026-10-01";
    const assessment = buildRouteAssessment({
      context: {
        ...supportedContext,
        facts: { ...supportedContext.facts, nominationDate: confirmed("2026-09-01") },
      },
      asOfDate,
      pack: approved,
    });
    expect(assessment.criteria[0].state).toBe("source_conflict");
    const current = buildRouteAssessment({
      context: {
        ...supportedContext,
        facts: { ...supportedContext.facts, nominationDate: confirmed("2026-10-02") },
      },
      asOfDate,
      pack: approved,
    });
    expect(current.criteria[0].state).toBe("supported");
  });

  it("requires human decisions to remain explicit", () => {
    const assessment = buildRouteAssessment({
      context: { ...context, facts: { ...context.facts, languageEvidence: confirmed(true) } },
      asOfDate,
      pack: pack({ criteria: [{ ...pack().criteria[0], individualReview: true }] }),
    });
    expect(assessment.criteria[0].state).toBe("review_required");
    expect(canSubmitRouteAssessment(assessment)).toBe(false);
  });

  it("binds a review to facts, dates, and rule version", () => {
    const assessment = buildRouteAssessment({ context, asOfDate });
    expect(isRouteAssessmentCurrent({ assessment, context, asOfDate })).toBe(true);
    expect(
      isRouteAssessmentCurrent({
        assessment,
        context: { ...context, facts: { ...context.facts, nationality: "Other" } },
        asOfDate,
      }),
    ).toBe(false);
    expect(isRouteAssessmentCurrent({ assessment, context, asOfDate: "2026-10-23" })).toBe(true);
    expect(isRouteAssessmentCurrent({ assessment, context, asOfDate: "2026-10-29" })).toBe(false);
    expect(
      isRouteAssessmentCurrent({
        assessment: { ...assessment, version: "old" },
        context,
        asOfDate,
      }),
    ).toBe(false);
    expect(isRouteAssessmentCurrent({ assessment: null, context, asOfDate })).toBe(false);
  });
});

describe("agency marked-ready policy", () => {
  it("accepts every expert-approved menu route without a separate machine-pack approval hold", () => {
    for (const [destinationCountry, routes] of Object.entries(VISA_TYPES_BY_DESTINATION)) {
      for (const { value: visaType } of routes) {
        const assessment = buildRouteAssessment({
          context: { destinationCountry, visaType },
          asOfDate,
        });
        expect(canMarkCaseReady(assessment), `${destinationCountry}: ${visaType}`).toBe(true);
        expect(canSubmitRouteAssessment(assessment)).toBe(false);
      }
    }
  });

  it("still blocks an unknown route and malformed saved assessments", () => {
    expect(
      canMarkCaseReady(
        buildRouteAssessment({
          context: { destinationCountry: "Other", visaType: "Unknown" },
          asOfDate,
        }),
      ),
    ).toBe(false);
    expect(canMarkCaseReady(null)).toBe(false);
  });

  it("keeps active encoded evidence requirements and calculation checks", () => {
    const missing = buildRouteAssessment({ context, asOfDate, pack: pack() });
    expect(canMarkCaseReady(missing)).toBe(false);
    const supported = buildRouteAssessment({
      context: { ...context, facts: { ...context.facts, languageEvidence: confirmed(true) } },
      asOfDate,
      pack: pack(),
    });
    expect(canMarkCaseReady(supported)).toBe(true);
    expect(
      canMarkCaseReady({ ...supported, calculations: [{ status: "unresolved", value: null }] }),
    ).toBe(false);
  });

  it("does not bypass an explicit incomplete or mismatched encoded rule set", () => {
    for (const incomplete of [
      pack({ inventoryComplete: false }),
      pack({ status: "retired" }),
      pack({ subtypes: ["different category"] }),
    ]) {
      expect(canMarkCaseReady(buildRouteAssessment({ context, asOfDate, pack: incomplete }))).toBe(
        false,
      );
    }
  });

  it("does not bypass a concrete criterion failure in a guidance record", () => {
    const assessment = buildRouteAssessment({ context, asOfDate });
    expect(
      canMarkCaseReady({
        ...assessment,
        blockers: [
          ...assessment.blockers,
          { id: "missing-evidence", kind: "criterion", message: "Evidence missing" },
        ],
      }),
    ).toBe(false);
  });
});
