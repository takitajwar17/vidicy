import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import {
  ensureAgencyTeamMembership,
  getDisabledAgencyMembershipForSession,
} from "@/server/agency-team";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { normalizeRedirectPath } from "@/utils/auth-redirect";
import AgencySetupClient from "./agency-setup.client";

export const metadata: Metadata = { title: "Set up your agency" };

export default async function AgencySetupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; redirect?: string }>;
}) {
  const { code, redirect: destination } = await searchParams;
  const requestedPath = normalizeRedirectPath(
    typeof destination === "string" ? destination : undefined,
  );
  const redirectPath =
    requestedPath.split(/[?#]/)[0] === "/agency-setup" ? "/dashboard" : requestedPath;
  const initialCode = typeof code === "string" ? code : "";
  const params = new URLSearchParams();
  if (initialCode) params.set("code", initialCode);
  if (redirectPath !== "/dashboard") params.set("redirect", redirectPath);
  const returnPath = `/agency-setup${params.size ? `?${params}` : ""}`;
  const session = await requireVerifiedPageSession(returnPath);
  const staff = await ensureAgencyTeamMembership(session);
  if (staff) redirect(redirectPath as Route);

  const disabledMembership = await getDisabledAgencyMembershipForSession(session);
  return (
    <AgencySetupClient
      initialCode={initialCode}
      redirectPath={redirectPath}
      disabledMembership={disabledMembership}
    />
  );
}
