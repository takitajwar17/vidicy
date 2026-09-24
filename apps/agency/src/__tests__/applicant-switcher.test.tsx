import { describe, expect, it, vi } from "vitest";
import type { ReactNode, ReactElement } from "react";

const { addApplicantButtonMock } = vi.hoisted(() => ({
  addApplicantButtonMock: vi.fn((_props: unknown) => null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/applications/add-applicant-button", () => ({
  AddApplicantButton: addApplicantButtonMock,
}));

import { ApplicantSwitcher } from "@/components/visa/applicant-switcher";

function renderNode(node: ReactNode): void {
  if (!node || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) renderNode(child);
    return;
  }

  const element = node as ReactElement<{ children?: ReactNode }>;

  if (typeof element.type === "function") {
    const render = element.type as (props: typeof element.props) => ReactNode;
    renderNode(render(element.props));
    return;
  }

  renderNode(element.props?.children);
}

describe("ApplicantSwitcher", () => {
  it("forwards billing-owner context to AddApplicantButton", () => {
    addApplicantButtonMock.mockClear();

    renderNode(
      ApplicantSwitcher({
        applicants: [
          {
            id: "appl_1",
            applicationId: "vapp_1",
            name: "Crafty Cat",
            relationship: "primary",
            role: "owner",
            dateOfBirth: null,
            passportNumber: null,
            nationality: "Bangladesh",
            readinessScore: null,
            riskLevel: null,
            email: "irtizairam12@gmail.com",
            userId: "usr_1",
            approvedBefore: null,
            approvedVisaType: null,
            approvedYear: null,
            rejectedBefore: null,
            rejectedVisaType: null,
            rejectedYear: null,
            rejectedReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            updateCounter: 0,
          },
        ],
        selectedApplicantId: "appl_1",
        applicationId: "vapp_1",
        currentStep: "checklist",
        canManageBilling: true,
        planInfo: { plan: "solo", paidApplicantCount: 2 },
      }),
    );

    expect(addApplicantButtonMock).toHaveBeenCalledTimes(1);
    expect(addApplicantButtonMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        applicationId: "vapp_1",
        compact: true,
        canManageBilling: true,
      }),
    );
  });
});
