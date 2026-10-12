import { describe, expect, it } from "vitest";
import {
  buildChecklistResearchContext,
  checklistResearchHash,
  getChecklistResearchDetails,
  getChecklistItemDescription,
  getApplicantChecklistDescription,
  normalizeChecklistCandidates,
  readChecklistSettings,
  validateChecklistSourceUrl,
} from "@/lib/checklist-research";

const application = {
  id: "case",
  homeCountry: "Bangladesh",
  currentCountry: "Bangladesh",
  destinationCountry: "Japan",
  visaType: "Tourist",
  embassy: "Dhaka",
  settings: "{}",
};
const applicant = {
  id: "person",
  name: "Client",
  relationship: "primary",
  nationality: "Canada",
  dateOfBirth: "2000-01-01",
};
function context(overrides: Record<string, unknown> = {}) {
  return buildChecklistResearchContext({
    application,
    applicants: [applicant],
    applicantId: applicant.id,
    now: new Date("2026-10-22T12:00:00Z"),
    ...overrides,
  });
}

describe("checklist research safety", () => {
  it("binds the cache to each person's facts, route facts and source version without a midnight reset", () => {
    const original = checklistResearchHash(context());
    for (const field of ["nationality", "dateOfBirth", "relationship", "rejectedReason"]) {
      expect(
        checklistResearchHash(context({ applicants: [{ ...applicant, [field]: "different" }] })),
      ).not.toBe(original);
    }
    for (const field of ["currentCountry", "embassy", "visaType", "destinationCountry"]) {
      expect(
        checklistResearchHash(context({ application: { ...application, [field]: "different" } })),
      ).not.toBe(original);
    }
    expect(
      checklistResearchHash(
        context({
          application: {
            ...application,
            settings: JSON.stringify({
              routeFacts: { stage: "extension", applicationDate: "2026-11-01" },
            }),
          },
        }),
      ),
    ).not.toBe(original);
    expect(checklistResearchHash(context({ now: new Date("2026-10-23T00:00:00Z") }))).toBe(
      original,
    );
    expect(checklistResearchHash(context({ sourceVersion: "next" }))).not.toBe(original);
  });

  it("ignores only generated research metadata and canonicalizes object key order", () => {
    const first = context({
      application: {
        ...application,
        settings: '{"routeFacts":{"b":2,"a":1},"checklistResearch":{"other":{"draft":true}}}',
      },
    });
    const second = context({
      application: { ...application, settings: '{"routeFacts":{"a":1,"b":2}}' },
    });
    expect(checklistResearchHash(first)).toBe(checklistResearchHash(second));
  });

  it("does not assume a dependent lives in the primary applicant's current country", () => {
    const child = { ...applicant, id: "child", relationship: "child" };
    const unknown = context({ applicants: [applicant, child], applicantId: "child" });
    const known = context({
      applicants: [applicant, { ...child, currentCountry: "Canada" }],
      applicantId: "child",
    });
    expect(unknown.applicant.currentCountry).toBeNull();
    expect(known.applicant.currentCountry).toBe("Canada");
    expect(checklistResearchHash(known)).not.toBe(checklistResearchHash(unknown));
  });

  it("does not inherit primary history and respects explicit false over legacy history", () => {
    const settings = JSON.stringify({ rejectedBefore: true, rejectedReason: "legacy refusal" });
    const dependent = { ...applicant, id: "child", relationship: "child", rejectedBefore: false };
    expect(
      context({
        application: { ...application, settings },
        applicants: [applicant, dependent],
        applicantId: "child",
      }).applicant.history.rejectedBefore,
    ).toBe(false);
    expect(
      context({
        application: { ...application, settings },
        applicants: [{ ...applicant, rejectedBefore: false }],
      }).applicant.history.rejectedBefore,
    ).toBe(false);
    expect(
      context({ application: { ...application, settings } }).applicant.history.rejectedBefore,
    ).toBe(true);
  });

  it.each(["primary", "child"])(
    "keeps unrecorded %s history unknown and distinct from an explicit no",
    (relationship) => {
      const person = { ...applicant, relationship, approvedBefore: null, rejectedBefore: null };
      const unknown = context({ applicants: [person] });
      const explicitNo = context({
        applicants: [{ ...person, approvedBefore: false, rejectedBefore: false }],
      });
      expect(unknown.applicant.history).toMatchObject({
        approvedBefore: null,
        rejectedBefore: null,
      });
      expect(explicitNo.applicant.history).toMatchObject({
        approvedBefore: false,
        rejectedBefore: false,
      });
      expect(checklistResearchHash(unknown)).not.toBe(checklistResearchHash(explicitNo));
    },
  );

  it("uses explicit primary legacy booleans without inferring other events", () => {
    const explicitNo = context({
      application: {
        ...application,
        settings: JSON.stringify({ approvedBefore: false, rejectedBefore: false }),
      },
    });
    expect(explicitNo.applicant.history).toMatchObject({
      approvedBefore: false,
      rejectedBefore: false,
    });
    for (const event of ["approved", "rejected"] as const) {
      const saved = context({
        application: {
          ...application,
          settings: JSON.stringify({ previousApplicationStatus: `previously_${event}` }),
        },
      });
      expect(saved.applicant.history).toMatchObject({
        approvedBefore: event === "approved" ? true : null,
        rejectedBefore: event === "rejected" ? true : null,
      });
    }
    const unknown = context({
      application: {
        ...application,
        settings: JSON.stringify({
          previousApplicationStatus: "not_recorded",
          approvedBefore: "false",
        }),
      },
    });
    expect(unknown.applicant.history).toMatchObject({ approvedBefore: null, rejectedBefore: null });
  });

  it("does not apply primary legacy history to a dependent with unknown history", () => {
    const dependent = {
      ...applicant,
      id: "child",
      relationship: "child",
      approvedBefore: null,
      rejectedBefore: null,
    };
    const saved = context({
      application: {
        ...application,
        settings: JSON.stringify({
          approvedBefore: true,
          rejectedBefore: true,
          previousApplicationStatus: "previously_rejected",
        }),
      },
      applicants: [applicant, dependent],
      applicantId: dependent.id,
    });
    expect(saved.applicant.history).toMatchObject({ approvedBefore: null, rejectedBefore: null });
  });

  it.each([
    "javascript:alert(1)",
    "http://example.gov/a",
    "https://user:pass@example.gov/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://169.254.169.254/a",
    "https://[::1]/a",
    "https://example.gov:8443/a",
  ])("rejects unsafe source URL %s", (url) => {
    expect(validateChecklistSourceUrl(url)).toBeNull();
  });

  it("preserves requirement classification and exact unverified source support", () => {
    const candidates = normalizeChecklistCandidates({
      items: [
        {
          documentName: "Passport",
          isRequired: true,
          requirement: "required",
          applicability: "applies",
          sources: [
            {
              url: "https://example.gov/a",
              claim: "A passport is required",
              quotation: "Bring your passport",
              verified: true,
            },
            { url: "https://example.gov/unretrieved", claim: "A different claim" },
            { url: "javascript:alert(1)", claim: "Unsafe" },
          ],
        },
      ],
      researchCitations: ["https://example.gov/a"],
    });
    expect(candidates[0]).toMatchObject({
      isRequired: true,
      requirement: "required",
      applicability: "applies",
      reviewStatus: "unreviewed",
      sources: [
        {
          url: "https://example.gov/a",
          claim: "A passport is required",
          quotation: "Bring your passport",
          reviewStatus: "unverified",
        },
      ],
    });
    expect(candidates[0].sources).toHaveLength(1);
  });

  it("allows small or large useful drafts, without mandatory defaults or document padding", () => {
    expect(
      normalizeChecklistCandidates({
        items: [{ documentName: "Passport" }],
        researchCitations: [],
      }),
    ).toMatchObject([{ isRequired: false, requirement: "unknown", sources: [] }]);
    expect(
      normalizeChecklistCandidates({
        items: Array.from({ length: 30 }, (_, i) => ({ documentName: `Document ${i}` })),
        researchCitations: [],
      }),
    ).toHaveLength(30);
  });

  it("preserves conditional and recommended classifications without requiring them", () => {
    const items = normalizeChecklistCandidates({
      items: [
        {
          documentName: "Permission",
          requirement: "conditional",
          condition: "If a minor travels alone",
          applicability: "unknown",
        },
        { documentName: "Itinerary", requirement: "recommended" },
      ],
      researchCitations: [],
    });
    expect(items.map((item) => item.requirement)).toEqual(["conditional", "recommended"]);
    expect(items.every((item) => item.isRequired === false)).toBe(true);
  });

  it("rejects malformed settings instead of discarding saved state", () => {
    expect(() => readChecklistSettings("invalid")).toThrow();
    expect(() => readChecklistSettings("[]")).toThrow();
  });

  it("shows current draft source claims and keeps prior research separate", () => {
    const latest = {
      status: "draft_pending_review",
      contextHash: checklistResearchHash(context()),
      sourceVersion: context().version,
      referenceDate: "2026-10-22",
      generatedAt: "2026-10-22T12:00:00Z",
      retrievedAt: "2026-10-22T11:00:00Z",
      source: "live_search",
      citations: ["https://example.gov/passport"],
      activeCandidateIds: ["new-item"],
      candidates: [
        {
          checklistItemId: "new-item",
          documentName: "Passport",
          requirement: "conditional",
          condition: "If applicable",
          sources: [
            {
              url: "https://example.gov/passport",
              claim: "Present a passport",
              quotation: "Bring your passport",
              scope: "Named route",
            },
            { url: "javascript:alert(1)", claim: "Unsafe" },
          ],
        },
      ],
    };
    const previous = {
      ...latest,
      contextHash: "0".repeat(64),
      activeCandidateIds: ["old-item"],
      candidates: [{ ...latest.candidates[0], checklistItemId: "old-item" }],
    };
    const saved = {
      ...application,
      settings: JSON.stringify({
        checklistResearch: { [applicant.id]: { ...latest, previousResearch: [previous] } },
      }),
    };
    const details = getChecklistResearchDetails({
      application: saved,
      applicants: [applicant],
      applicantId: applicant.id,
      now: new Date("2026-10-22T12:00:00Z"),
    });
    expect(details.currentness).toBe("current");
    expect(details.records).toHaveLength(2);
    expect(details.records[0].activeCandidateIds).toEqual(["new-item"]);
    expect(details.records[0].candidates[0]).toMatchObject({
      isRequired: false,
      requirement: "conditional",
      sources: [
        {
          url: "https://example.gov/passport",
          claim: "Present a passport",
          reviewStatus: "unverified",
        },
      ],
    });
    expect(details.records[0].candidates[0].sources).toHaveLength(1);
    expect(details.records[1].activeCandidateIds).toEqual(["old-item"]);
    expect(
      getChecklistResearchDetails({
        application: { ...saved, visaType: "Working Holiday" },
        applicants: [applicant],
        applicantId: applicant.id,
        now: new Date("2026-10-22T12:00:00Z"),
      }).currentness,
    ).toBe("outdated");
    expect(
      getChecklistResearchDetails({
        application: saved,
        applicants: [applicant],
        applicantId: applicant.id,
        now: new Date("2026-10-23T00:00:00Z"),
      }).currentness,
    ).toBe("current");
  });

  it("reports absent or unreadable research without trusting malformed metadata", () => {
    const input = {
      application,
      applicants: [applicant],
      applicantId: applicant.id,
      now: new Date("2026-10-22T12:00:00Z"),
    };
    expect(getChecklistResearchDetails(input)).toMatchObject({
      currentness: "unavailable",
      records: [],
    });
    expect(
      getChecklistResearchDetails({
        ...input,
        application: { ...application, settings: "invalid" },
      }),
    ).toMatchObject({ currentness: "unavailable", records: [] });
    expect(
      getChecklistResearchDetails({
        ...input,
        application: {
          ...application,
          settings: JSON.stringify({
            checklistResearch: { [applicant.id]: { status: "approved", candidates: [] } },
          }),
        },
      }),
    ).toMatchObject({ currentness: "unavailable", records: [] });
  });
});

it("cleans the old generated description prefix without removing document instructions", () => {
  const instructions = "Provide the admission letter. Condition: If requested by the institution.";
  expect(
    getChecklistItemDescription(
      `Draft — staff must confirm this document and its applicability. ${instructions}`,
    ),
  ).toBe(instructions);
  expect(getChecklistItemDescription(instructions)).toBe(instructions);
  expect(getChecklistItemDescription("Provide the first draft of the study plan.")).toBe(
    "Provide the first draft of the study plan.",
  );
});

it("uses a neutral applicant reference in checklist descriptions without changing other names", () => {
  expect(
    getApplicantChecklistDescription({
      description:
        "Determine if Avery Carter needs a visa. Use Avery's admission letter from Carter College.",
      applicantName: "Avery Carter",
    }),
  ).toBe(
    "Determine if the applicant needs a visa. Use the applicant's admission letter from Carter College.",
  );
  expect(
    getApplicantChecklistDescription({
      description: "Avery Carter must provide a letter. Avery’s sponsor is Morgan Carter.",
      applicantName: "Avery Carter",
    }),
  ).toBe("The applicant must provide a letter. The applicant’s sponsor is Morgan Carter.");
  expect(
    getApplicantChecklistDescription({
      description: "Avery Carter must provide a letter.",
    }),
  ).toBe("Avery Carter must provide a letter.");
});
