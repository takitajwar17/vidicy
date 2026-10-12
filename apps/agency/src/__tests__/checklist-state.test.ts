import { describe, expect, it } from "vitest";
import {
  getChecklistRequirement,
  getReviewAvailability,
  resolveChecklistItems,
} from "@/lib/checklist-state";

const item = { id: "passport", applicantId: "person", isRequired: false };
const document = {
  id: "file",
  checklistItemId: item.id,
  extractionStatus: "completed",
  textContent: "Passport evidence",
};

describe("checklist and evidence state", () => {
  it("preserves required, conditional, recommended and unknown classifications", () => {
    expect(
      getChecklistRequirement({ ...item, requirementType: "required", applicability: "applies" })
        .isRequired,
    ).toBe(true);
    expect(
      getChecklistRequirement({
        ...item,
        requirementType: "conditional",
        applicability: "unknown",
      }),
    ).toMatchObject({ isRequired: false, unresolved: true });
    expect(
      getChecklistRequirement({
        ...item,
        requirementType: "recommended",
        applicability: "applies",
      }),
    ).toMatchObject({ isRequired: false, unresolved: false });
    expect(getChecklistRequirement({ ...item, requirementType: "unknown" }).unresolved).toBe(true);
  });

  it("recovers a legacy generated requirement without treating it as optional", () => {
    const settings = JSON.stringify({
      checklistResearch: {
        person: {
          candidates: [
            {
              checklistItemId: "passport",
              requirement: "required",
              applicability: "applies",
              condition: "",
            },
          ],
        },
      },
    });
    expect(resolveChecklistItems({ items: [item], settings })[0]).toMatchObject({
      isRequired: true,
      requirementType: "required",
    });
  });

  it("does not recover a removed item or override a staff edit", () => {
    const settings = JSON.stringify({
      checklistResearch: {
        person: {
          candidates: [
            { checklistItemId: "passport", requirement: "required", applicability: "applies" },
          ],
        },
      },
    });
    expect(
      resolveChecklistItems({ items: [{ ...item, removedAt: new Date() }], settings }),
    ).toEqual([]);
    expect(
      resolveChecklistItems({
        items: [
          { ...item, requirementType: "recommended", applicability: "applies", origin: "staff" },
        ],
        settings,
      })[0].isRequired,
    ).toBe(false);
  });

  it("blocks an empty checklist and zero files", () => {
    expect(
      getReviewAvailability({ applicantId: "person", items: [], documents: [] }).reason,
    ).toContain("checklist");
    expect(
      getReviewAvailability({ applicantId: "person", items: [item], documents: [] }).reason,
    ).toContain("Upload");
  });

  it("permits partial evidence but not another applicant's files", () => {
    expect(
      getReviewAvailability({
        applicantId: "person",
        items: [item, { ...item, id: "bank" }],
        documents: [document],
      }).canReview,
    ).toBe(true);
    expect(
      getReviewAvailability({ applicantId: "other", items: [item], documents: [document] })
        .canReview,
    ).toBe(false);
  });

  it("distinguishes processing and unreadable files, without requiring search indexing", () => {
    expect(
      getReviewAvailability({
        applicantId: "person",
        items: [item],
        documents: [{ ...document, textContent: null, extractionStatus: "queued" }],
      }).state,
    ).toBe("processing");
    expect(
      getReviewAvailability({
        applicantId: "person",
        items: [item],
        documents: [{ ...document, textContent: null, extractionStatus: "failed" }],
      }).state,
    ).toBe("unreadable");
    expect(
      getReviewAvailability({
        applicantId: "person",
        items: [item],
        documents: [{ ...document, indexingStatus: "failed" }],
      }).canReview,
    ).toBe(true);
  });
});
