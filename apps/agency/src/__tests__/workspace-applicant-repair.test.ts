import { describe, expect, it } from "vitest";
import { buildPrimaryApplicantRepairValues } from "@/app/(workspace)/dashboard/[appId]/_workspace-applicant-repair";

describe("buildPrimaryApplicantRepairValues", () => {
  it("seeds the repaired primary applicant from the application owner", () => {
    expect(
      buildPrimaryApplicantRepairValues({
        applicationId: "app_123",
        nationality: "Bangladesh",
        ownerUser: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
        ownerUserId: "user_owner",
      }),
    ).toEqual({
      applicationId: "app_123",
      name: "Ada Lovelace",
      relationship: "primary",
      role: "owner",
      email: "ada@example.com",
      userId: "user_owner",
      nationality: "Bangladesh",
    });
  });

  it("falls back to a generic owner-safe seed when the owner profile is unavailable", () => {
    expect(
      buildPrimaryApplicantRepairValues({
        applicationId: "app_456",
        ownerUserId: "user_owner",
      }),
    ).toEqual({
      applicationId: "app_456",
      name: "Primary Applicant",
      relationship: "primary",
      role: "owner",
      email: null,
      userId: "user_owner",
      nationality: null,
    });
  });
});
