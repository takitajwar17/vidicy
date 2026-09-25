import { describe, expect, it } from "vitest";

import { onboardingEmail1Text } from "@/react-email/lifecycle/onboarding-email-1";
import { onboardingEmail2Text } from "@/react-email/lifecycle/onboarding-email-2";
import { onboardingEmail6Text } from "@/react-email/lifecycle/onboarding-email-6";
import { onboardingEmail7Text } from "@/react-email/lifecycle/onboarding-email-7";
import { postPurchaseEmail1Text } from "@/react-email/lifecycle/post-purchase-email-1";
import { postPurchaseEmail2Text } from "@/react-email/lifecycle/post-purchase-email-2";
import { postPurchaseEmail6Text } from "@/react-email/lifecycle/post-purchase-email-6";
import { winbackEmail1Text } from "@/react-email/lifecycle/winback-email-1";
import { winbackEmail2Text } from "@/react-email/lifecycle/winback-email-2";
import { winbackEmail3Text } from "@/react-email/lifecycle/winback-email-3";

describe("marketing lifecycle email templates", () => {
  const dashboardUrl = "https://vidicy.com/dashboard";
  const checklistUrl = "https://vidicy.com/dashboard/vapp_123/checklist";
  const evaluationUrl = "https://vidicy.com/dashboard/vapp_123/evaluation";

  it("renders onboarding email 1 with the dashboard CTA", () => {
    const text = onboardingEmail1Text({ firstName: "Tajwar", dashboardUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(dashboardUrl);
    expect(text.length).toBeGreaterThan(100);
  });

  it("renders onboarding email 2 with the checklist CTA", () => {
    const text = onboardingEmail2Text({ firstName: "Tajwar", dashboardUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(dashboardUrl);
    expect(text.length).toBeGreaterThan(100);
  });

  it("renders onboarding email 6 with the correct CTA for uploaded documents", () => {
    const text = onboardingEmail6Text({
      firstName: "Tajwar",
      atlasUrl: "https://vidicy.com/dashboard/vapp_123/atlas",
      checklistUrl,
      hasUploadedDocuments: true,
    });

    expect(text).toContain("Tajwar");
    expect(text).toContain("/dashboard/vapp_123/atlas");
  });

  it("renders onboarding email 7 with a workspace CTA", () => {
    const text = onboardingEmail7Text({ firstName: "Tajwar", dashboardUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(dashboardUrl);
  });

  it("renders post-purchase email 1 with the checklist CTA", () => {
    const text = postPurchaseEmail1Text({ firstName: "Tajwar", checklistUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(checklistUrl);
    expect(text.length).toBeGreaterThan(120);
  });

  it("renders post-purchase email 2 with both upload and evaluation CTAs", () => {
    const text = postPurchaseEmail2Text({ firstName: "Tajwar", checklistUrl, evaluationUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(checklistUrl);
    expect(text).toContain(evaluationUrl);
    expect(text.length).toBeGreaterThan(120);
  });

  it("renders post-purchase email 6 with checklist and Atlas CTAs", () => {
    const text = postPurchaseEmail6Text({
      firstName: "Tajwar",
      checklistUrl,
      atlasUrl: "https://vidicy.com/dashboard/vapp_123/atlas",
    });

    expect(text).toContain(checklistUrl);
    expect(text).toContain("/dashboard/vapp_123/atlas");
  });

  it("renders win-back email 1 with the dashboard CTA", () => {
    const text = winbackEmail1Text({ firstName: "Tajwar", dashboardUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(dashboardUrl);
    expect(text.length).toBeGreaterThan(100);
  });

  it("renders win-back email 2 with the dashboard CTA", () => {
    const text = winbackEmail2Text({ firstName: "Tajwar", dashboardUrl });

    expect(text).toContain("Tajwar");
    expect(text).toContain(dashboardUrl);
    expect(text.length).toBeGreaterThan(120);
  });

  it("renders win-back email 3 with a comeback code and expiry", () => {
    const text = winbackEmail3Text({
      firstName: "Tajwar",
      dashboardUrl,
      expiryDate: "March 12, 2026",
    });

    expect(text).toContain("COMEBACK20");
    expect(text).toContain("March 12, 2026");
    expect(text).toContain(dashboardUrl);
  });
});
