import { requireAgencyPageSession } from "@/utils/auth-page";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { AgencyDashboard } from "@/components/agency/agency-dashboard";
import { EmptyState } from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { getAgencyDashboardData } from "@/server/agency-data";
import { formatReviewerDisplayName, getDisplayCaseNumber } from "@/lib/agency-workflow";
import type { DashboardCase } from "@/lib/agency-dashboard-queue";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requireAgencyPageSession("/dashboard");
  const data = await getAgencyDashboardData();
  const cases: DashboardCase[] = data.cases.map((row) => ({
    id: row.application.id,
    caseNumber: getDisplayCaseNumber(row.application.caseNumber, row.application.id),
    clientName: row.application.clientName ?? "",
    applicantName: row.primaryApplicant?.name ?? "",
    destination: row.application.destinationCountry,
    visaType: row.application.visaType,
    status: row.application.agencyStatus,
    dueDate: row.application.dueAt?.toISOString().slice(0, 10) ?? null,
    updatedAt: row.application.updatedAt.toISOString(),
    reviewerId: row.application.assignedReviewerId,
    reviewerName: row.reviewer ? formatReviewerDisplayName(row.reviewer) : null,
    reviewerAvatar: row.reviewer?.avatar ?? null,
    requiredCount: row.requiredDocumentCount,
    uploadedRequiredCount: row.uploadedRequiredDocumentCount,
    hasChecklist: row.hasChecklist,
    usableDocumentCount: row.usableDocumentCount,
    unresolvedRequirementCount: row.unresolvedRequirementCount,
    reviewState: row.reviewState,
    openIssueCount: row.openIssueCount,
    finalSubmissionAt: row.application.finalSubmissionAt?.toISOString() ?? null,
  }));

  return (
    <AgencyPageShell
      breadcrumbs={[{ href: "/dashboard", label: "Dashboard" }]}
      title="Dashboard"
      description="Client files, deadlines, and the next step."
      actions={
        <Button asChild>
          <Link href="/dashboard/applications/new">
            <PlusIcon className="size-4" />
            New client file
          </Link>
        </Button>
      }
    >
      {cases.length === 0 ? (
        <EmptyState
          title="No agency cases yet"
          description="Add the first client, applicant, route, and reviewer. The case will appear here before documents arrive."
          href="/dashboard/applications/new"
          actionLabel="New client file"
        />
      ) : (
        <Suspense
          fallback={<p className="p-4 text-sm text-muted-foreground">Loading client files…</p>}
        >
          <AgencyDashboard
            cases={cases}
            today={new Date().toISOString().slice(0, 10)}
            reviewers={data.workload.map((member) => ({
              id: member.id,
              name: member.displayName ?? "Unassigned",
              avatar: member.user?.avatar ?? null,
              active: member.inReview,
              ready: member.completed,
            }))}
          />
        </Suspense>
      )}
    </AgencyPageShell>
  );
}
