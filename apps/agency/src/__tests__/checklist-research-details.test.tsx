import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn(), pending: false }));
vi.mock("@/hooks/use-checklist-job", () => ({
  useChecklistJob: () => ({ job: null, start: mocks.start, loading: mocks.pending, error: null }),
}));

import {
  ChecklistResearchDetails,
  ChecklistSourceEvidence,
} from "@/components/agency/checklist-research-details";
import { ChecklistResearchRefresh } from "@/components/agency/checklist-research-refresh";
import {
  buildChecklistResearchContext,
  checklistResearchHash,
  getChecklistResearchDetails,
} from "@/lib/checklist-research";

describe("checklist source controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending = false;
  });

  it("makes unknown provenance clear for every person and renders a refresh control", () => {
    const html = renderToStaticMarkup(
      <ChecklistResearchDetails
        application={{
          id: "case",
          homeCountry: "Bangladesh",
          currentCountry: "Bangladesh",
          destinationCountry: "Canada",
          visaType: "Express Entry",
          embassy: "IRCC",
          settings: "{}",
        }}
        applicants={[
          { id: "parent", name: "Parent", relationship: "primary" },
          { id: "child", name: "Child", relationship: "child" },
        ]}
      />,
    );
    expect(html).toContain("Checklist sources");
    expect(html).not.toMatch(/draft|unverified|not approved|not confirmed/i);
    expect(html).toContain("Parent");
    expect(html).toContain("Child");
    expect(html.match(/Refresh checklist/g)).toHaveLength(2);
    expect(html.match(/No saved checklist sources/g)).toHaveLength(2);
  });

  it("requests a background refresh", () => {
    const element = ChecklistResearchRefresh({ applicationId: "case", applicantId: "person" });
    const button = element.props.children[0];
    button.props.onClick();
    expect(mocks.start).toHaveBeenCalledWith(true);
  });

  it("keeps saved evidence available without freshness claims for case or code changes", () => {
    const application = {
      id: "case",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Short-Stay Tourist",
      embassy: "Dhaka",
      settings: "{}",
    };
    const applicants = [{ id: "person", name: "Client", relationship: "primary" }];
    const context = buildChecklistResearchContext({
      application,
      applicants,
      applicantId: "person",
      now: new Date(),
    });
    application.settings = JSON.stringify({
      checklistResearch: {
        person: {
          status: "draft_pending_review",
          contextHash: checklistResearchHash(context),
          sourceVersion: context.version,
          referenceDate: context.referenceDate,
          generatedAt: new Date().toISOString(),
          retrievedAt: null,
          source: "live_search",
          citations: ["https://example.gov/documents"],
          activeCandidateIds: ["item"],
          candidates: [
            {
              checklistItemId: "item",
              documentName: "Passport proposal",
              requirement: "conditional",
              condition: "If requested",
              sources: [
                {
                  url: "https://example.gov/documents",
                  claim: "Passport source claim",
                  quotation: "Saved quotation",
                },
              ],
            },
          ],
        },
      },
    });
    const html = renderToStaticMarkup(
      <ChecklistResearchDetails application={application} applicants={applicants} />,
    );
    expect(html).toContain("Checked");
    expect(html).not.toMatch(/Out of date|Matches case details|Case details changed/);
    expect(html).toContain("View sources");
    expect(html).not.toContain("Passport proposal");
    expect(html).not.toContain("Passport source claim");
    const evidence = renderToStaticMarkup(
      <ChecklistSourceEvidence
        {...getChecklistResearchDetails({
          application,
          applicants,
          applicantId: "person",
          now: new Date(),
        })}
      />,
    );
    expect(html).not.toContain(">Client<");
    expect(evidence).toContain("Conditional");
    expect(evidence).toContain('href="https://example.gov/documents"');
    expect(evidence).toContain("Passport source claim");
    expect(evidence).toContain("Saved quotation");
    expect(evidence).not.toContain("rounded");
    const changed = renderToStaticMarkup(
      <ChecklistResearchDetails
        application={{ ...application, destinationCountry: "Canada", visaType: "Express Entry" }}
        applicants={applicants}
      />,
    );
    expect(changed).toContain("Checked");
    expect(changed).not.toMatch(/Out of date|Matches case details|Case details changed/);
    const savedSettings = JSON.parse(application.settings);
    savedSettings.checklistResearch.person.sourceVersion =
      "checklist-draft-v3-2026-10-22:route-review-v1";
    const olderCodeVersion = renderToStaticMarkup(
      <ChecklistResearchDetails
        application={{ ...application, settings: JSON.stringify(savedSettings) }}
        applicants={applicants}
      />,
    );
    expect(olderCodeVersion).toContain("View sources");
    expect(olderCodeVersion).not.toMatch(/Out of date|Case details changed/);
    expect(changed).toContain("View sources");
    expect(changed).not.toContain("Passport proposal");
  });

  it("disables another refresh while research is pending", () => {
    mocks.pending = true;
    const button = ChecklistResearchRefresh({ applicationId: "case", applicantId: "person" });
    expect(button.props.children[0].props.disabled).toBe(true);
  });
});
