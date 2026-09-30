import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FilesIcon,
  UploadIcon,
} from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AddReviewIssueForm,
  AgencyCaseToolbar,
  ReviewIssueStatusSelect,
} from "@/components/agency/agency-case-actions";
import {
  CaseStatusBadge,
  IssueSeverityBadge,
  MetricCard,
  PriorityBadge,
  ReviewerAvatar,
  RiskBadge,
  formatBytes,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { ChecklistGenerator } from "@/components/visa/checklist-generator";
import { DeleteDocumentButton } from "@/components/visa/delete-document-button";
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer";
import { DocumentUpload } from "@/components/visa/document-upload";
import { EvaluationTrigger } from "@/components/visa/evaluation-trigger";
import { SetDocumentActiveButton } from "@/components/visa/set-document-active-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CHECKLIST_ITEM_STATUS, REVIEW_ISSUE_STATUS } from "@/db/schema";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyCaseDetail } from "@/server/agency-data";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";

function getPersonName(user: { firstName: string | null; lastName: string | null; email: string | null } | null) {
  if (!user) return null;
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || null;
}

function isUploadedStatus(status: string) {
  return status === CHECKLIST_ITEM_STATUS.UPLOADED || status === CHECKLIST_ITEM_STATUS.APPROVED;
}

export async function AgencyCaseContent({ appId }: { appId: string }) {
  await requireApplicationPagePermission(appId, "access_application");

  const data = await getAgencyCaseDetail(appId);
  const app = data.application;

  if (!app || app.trashedAt) {
    notFound();
  }

  const primaryApplicant = data.primaryApplicant;
  const assignedReviewer = data.staff.find((member) => member.userId === app.assignedReviewerId && member.user) ?? null;
  const requiredItems = data.checklistItems.filter((item) => item.isRequired);
  const optionalItems = data.checklistItems.filter((item) => !item.isRequired);
  const uploadedRequiredCount = requiredItems.filter((item) => isUploadedStatus(item.status)).length;
  const completionPercent =
    requiredItems.length > 0 ? Math.round((uploadedRequiredCount / requiredItems.length) * 100) : 0;
  const hasChecklist = data.checklistItems.length > 0;
  const hasDocuments = data.documents.length > 0;
  const openIssues = data.issues.filter(
    (issue) =>
      issue.status !== REVIEW_ISSUE_STATUS.RESOLVED &&
      issue.status !== REVIEW_ISSUE_STATUS.DISMISSED,
  );
  const highIssues = openIssues.filter((issue) => issue.severity === "high");
  const totalStorage = data.documents.reduce((sum, document) => sum + document.fileSize, 0);
  const docsByChecklistItem = new Map<string, typeof data.documents>();
  for (const document of data.documents) {
    if (!document.checklistItemId) continue;
    const existing = docsByChecklistItem.get(document.checklistItemId) ?? [];
    existing.push(document);
    docsByChecklistItem.set(document.checklistItemId, existing);
  }
  const staffOptions = data.staff
    .filter((member) => member.userId && member.user)
	    .map((member) => ({
	      userId: member.userId!,
	      label: getPersonName(member.user) ?? member.email ?? "Reviewer",
	    }));
  const caseNumber = getDisplayCaseNumber(app.caseNumber, app.id);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/applications", label: "Applications" },
        { href: `/dashboard/${app.id}`, label: caseNumber },
      ]}
      title={`Application #${caseNumber}`}
      description={[
        app.clientName ? `Client: ${app.clientName}` : null,
        primaryApplicant?.name ? `Applicant: ${primaryApplicant.name}` : null,
        `${app.destinationCountry} ${app.visaType}`,
        app.submittedAt ? `Received ${formatShortDate(app.submittedAt)}` : null,
      ].filter(Boolean).join(" · ")}
      actions={
        <AgencyCaseToolbar
          applicationId={app.id}
          status={app.agencyStatus}
          assignedReviewerId={app.assignedReviewerId}
          staff={staffOptions}
          hasEvaluation={Boolean(data.latestEvaluation)}
        />
      }
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={FilesIcon} label="Documents" value={data.documents.length} detail={`${formatBytes(totalStorage)} uploaded`} tone="info" />
        <MetricCard icon={CheckCircle2Icon} label="Checklist" value={`${completionPercent}%`} detail={`${uploadedRequiredCount}/${requiredItems.length || 0} required`} tone="success" />
        <MetricCard icon={AlertTriangleIcon} label="Open Issues" value={openIssues.length} detail={`${highIssues.length} high priority`} tone={highIssues.length > 0 ? "danger" : "warning"} />
        <MetricCard icon={BrainCircuitIcon} label="AI Score" value={data.latestEvaluation?.overallScore ?? "—"} detail={data.latestEvaluation ? "Latest review score" : "Not reviewed"} tone="default" />
        <MetricCard icon={Clock3Icon} label="Due Date" value={app.dueAt ? formatShortDate(app.dueAt) : "Not set"} detail="Internal SLA" tone="warning" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_420px]">
        <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Documents</CardTitle>
            <Badge variant="outline" className="rounded-full text-2xs font-bold">
              {data.documents.length} file{data.documents.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {!primaryApplicant ? (
              <p className="text-sm text-muted-foreground">Add an applicant before generating the review checklist.</p>
            ) : !hasChecklist ? (
              <ChecklistGenerator
                applicationId={app.id}
                applicantId={primaryApplicant.id}
                applicantName={primaryApplicant.name}
              />
            ) : (
              <div className="space-y-3">
                {[...requiredItems, ...optionalItems].map((item) => {
                  const itemDocs = docsByChecklistItem.get(item.id) ?? [];
                  return (
                    <div key={item.id} className="rounded-xl border border-border/80 bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold">{item.documentName}</p>
                            <Badge variant={item.isRequired ? "default" : "outline"} className="rounded-full text-2xs">
                              {item.isRequired ? "Required" : "Optional"}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <DocumentUpload applicationId={app.id} applicantId={primaryApplicant.id} checklistItemId={item.id} />
                      </div>
                      {itemDocs.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-lg bg-muted/35 p-2">
                          {itemDocs.map((document, index) => (
                            <DocumentPreviewDrawer
                              key={document.id}
                              documentId={document.id}
                              fileName={document.fileName}
                              fileSize={document.fileSize}
                              mimeType={document.mimeType}
                              uploadedAt={document.uploadedAt}
                              isActive={index === 0}
                              hasMultipleVersions={itemDocs.length > 1}
                              sectionLabel={item.documentName}
                            >
                              {index !== 0 ? <SetDocumentActiveButton documentId={document.id} applicationId={app.id} /> : null}
                              <DeleteDocumentButton documentId={document.id} applicationId={app.id} fileName={document.fileName} />
                            </DocumentPreviewDrawer>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Review summary</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <CaseStatusBadge status={app.agencyStatus} />
                <RiskBadge riskLevel={data.latestEvaluation?.riskLevel ?? app.riskLevel} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Priority</p>
                  <PriorityBadge priority={app.priority} />
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Reviewer</p>
	                  <ReviewerAvatar
	                    name={getPersonName(assignedReviewer?.user ?? null)}
	                    email={assignedReviewer?.user?.email ?? null}
	                    avatar={assignedReviewer?.user?.avatar ?? null}
	                    className="mt-1"
	                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Client report</p>
                  <p className="mt-1 text-sm font-bold capitalize">{app.clientReportStatus.replaceAll("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">Final submission</p>
                  <p className="mt-1 text-sm font-bold">{formatShortDate(app.finalSubmissionAt)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Required document readiness</p>
                  <span className="text-xs font-bold text-muted-foreground">{completionPercent}%</span>
                </div>
                <Progress value={completionPercent} className="h-2" />
              </div>

              {primaryApplicant ? (
                <div className="flex flex-wrap gap-2">
                  <EvaluationTrigger
                    applicationId={app.id}
                    applicantId={primaryApplicant.id}
                    hasDocuments={hasDocuments}
                    rerun={Boolean(data.latestEvaluation)}
                  />
                  {!hasDocuments && hasChecklist ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 text-xs font-bold text-muted-foreground">
                      <UploadIcon className="h-3.5 w-3.5" />
                      Upload at least one document first
                    </span>
                  ) : null}
                </div>
              ) : null}

              {data.latestEvaluation ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-bold">AI review summary</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{data.latestEvaluation.summary}</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-card p-3">
                      <p className="text-xs font-bold text-muted-foreground">Red flags</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {data.latestEvaluation.redFlags.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card p-3">
                      <p className="text-xs font-bold text-muted-foreground">Strengths</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {data.latestEvaluation.strengths.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-card p-3">
                      <p className="text-xs font-bold text-muted-foreground">Reviewer actions</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {data.latestEvaluation.recommendations.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/80 bg-card p-5 text-sm text-muted-foreground">
                  Run AI review after documents are uploaded. Reviewer flags and client report drafts can be generated from that result.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Client-ready report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.latestReport ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline" className="rounded-full text-2xs font-bold capitalize">
                      {data.latestReport.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatShortDate(data.latestReport.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{data.latestReport.summary}</p>
                  <div className="space-y-2">
                    {data.latestReport.actionItems.slice(0, 5).map((item) => (
                      <div key={`${item.title}-${item.detail}`} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold">{item.title}</p>
                          <IssueSeverityBadge severity={item.severity} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Generate a client report after AI flags or reviewer issues are added.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">AI and reviewer flags</CardTitle>
              <Badge variant="outline" className="rounded-full text-2xs font-bold">
                {openIssues.length} open
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.issues.length > 0 ? (
                data.issues.map((issue) => (
                  <div key={issue.id} className="rounded-xl border border-border/80 bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{issue.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.description}</p>
                      </div>
                      <IssueSeverityBadge severity={issue.severity} />
                    </div>
                    {issue.recommendation ? (
                      <p className="mt-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{issue.recommendation}</p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                      <ReviewIssueStatusSelect issueId={issue.id} status={issue.status} />
                      <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">{issue.source}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No issues yet. Run AI review, sync AI flags, or add a reviewer issue.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Add reviewer issue</CardTitle>
            </CardHeader>
            <CardContent>
              <AddReviewIssueForm applicationId={app.id} />
            </CardContent>
          </Card>
        </aside>
      </section>
    </AgencyPageShell>
  );
}
