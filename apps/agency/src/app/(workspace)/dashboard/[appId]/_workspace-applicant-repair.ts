import {
  APPLICANT_RELATIONSHIP,
  APPLICANT_ROLE,
} from "@/db/schema";

interface OwnerUserSeed {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export function buildPrimaryApplicantRepairValues({
  applicationId,
  nationality,
  ownerUser,
  ownerUserId,
}: {
  applicationId: string;
  nationality?: string | null;
  ownerUser?: OwnerUserSeed | null;
  ownerUserId: string;
}) {
  const primaryName =
    [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(" ").trim() ||
    (ownerUser?.email ?? "").split("@")[0] ||
    "Primary Applicant";

  return {
    applicationId,
    name: primaryName,
    relationship: APPLICANT_RELATIONSHIP.PRIMARY,
    role: APPLICANT_ROLE.OWNER,
    email: ownerUser?.email ?? null,
    userId: ownerUserId,
    nationality: nationality ?? null,
  };
}
