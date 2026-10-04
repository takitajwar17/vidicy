import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleIcon,
  Clock3Icon,
  FileIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react";

import {
  AddReviewIssueForm,
  AgencyCaseStatusSelect,
  ReviewIssueStatusSelect,
} from "@/components/agency/agency-case-actions";
import {
  IssueSeverityBadge,
  PriorityBadge,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { AgencyCaseDocumentDesk } from "@/components/agency/agency-case-document-desk";
import { DocumentUpload } from "@/components/visa/document-upload";
import { EvaluationTrigger } from "@/components/visa/evaluation-trigger";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { CHECKLIST_ITEM_STATUS } from "@/db/schema";
import {
  CLIENT_REPORT_STATUS_META,
  formatAgencyVisaLabel,
  getDisplayCaseNumber,
  isOpenReviewIssueStatus,
} from "@/lib/agency-workflow";
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
  const docsByChecklistItem = new Map<string, typeof data.documents>();

  for (const document of data.documents) {
    if (!document.checklistItemId) continue;
    const existing = docsByChecklistItem.get(document.checklistItemId) ?? [];
    existing.push(document);
    docsByChecklistItem.set(document.checklistItemId, existing);
  }

  const requiredItems = data.checklistItems.filter((item) => item.isRequired);
  const uploadedRequiredCount = requiredItems.filter((item) => isUploadedStatus(item.status)).length;
  const completionPercent =
    requiredItems.length > 0 ? Math.round((uploadedRequiredCount / requiredItems.length) * 100) : 0;
  const missingRequiredItems = requiredItems.filter((item) => !docsByChecklistItem.has(item.id));
  const openIssues = data.issues.filter((issue) => isOpenReviewIssueStatus(issue.status));
  const highIssues = openIssues.filter((issue) => issue.severity === "high");
  const mediumIssues = openIssues.filter((issue) => issue.severity === "medium");
  const totalStorage = data.documents.reduce((sum, document) => sum + document.fileSize, 0);
  const caseNumber = getDisplayCaseNumber(app.caseNumber, app.id);
  const firstChecklistItem = data.checklistItems[0] ?? null;
  const hasDocuments = data.documents.length > 0;
  const hasEvaluation = Boolean(data.latestEvaluation);
  const hasReport = Boolean(data.latestReport);
  const reviewerName = getPersonName(assignedReviewer?.user ?? null);

  const documentRows = data.documents.map((document) => ({
    id: document.id,
    checklistItemId: document.checklistItemId,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    pageCount: document.pageCount,
    extractionStatus: document.extractionStatus,
  }));
  const checklistRows = data.checklistItems.map((item) => ({
    id: item.id,
    documentName: item.documentName,
    status: item.status,
  }));

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/applications", label: "Applications" },
          { href: `/dashboard/${app.id}`, label: caseNumber },
        ]}
      />

      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-4 px-4 py-5 md:px-6 xl:h-[calc(100vh-4rem)]">
        <section className="flex flex-col gap-4 border-b border-border/70 pb-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Case #{caseNumber}
              </h1>
              <AgencyCaseStatusSelect applicationId={app.id} status={app.agencyStatus} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {app.clientName ? <span><span className="font-semibold text-foreground">Client:</span> {app.clientName}</span> : null}
              {primaryApplicant?.name ? <span><span className="font-semibold text-foreground">Applicant:</span> {primaryApplicant.name}</span> : null}
              <span>
                <span className="font-semibold text-foreground">Visa:</span>{" "}
                {formatAgencyVisaLabel({
                  destinationCountry: app.destinationCountry,
                  visaType: app.visaType,
                })}
              </span>
              <span><span className="font-semibold text-foreground">Destination:</span> {app.destinationCountry}</span>
              {app.submittedAt ? <span><span className="font-semibold text-foreground">Submitted:</span> {formatShortDate(app.submittedAt)}</span> : null}
            </div>
          </div>

        </section>

        <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_430px]">
          <AgencyCaseDocumentDesk
            applicationId={app.id}
            applicantId={primaryApplicant?.id ?? null}
            firstChecklistItemId={firstChecklistItem?.id ?? null}
            documents={documentRows}
            checklistItems={checklistRows}
            totalStorage={totalStorage}
          />

          <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--shadow-dashboard)] xl:min-h-0">
            <Tabs defaultValue="review" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="grid h-14 w-full grid-cols-4 rounded-none border-0 border-b border-border/70 bg-card p-0">
                <TabsTrigger value="review" className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                  Review
                </TabsTrigger>
                <TabsTrigger value="checklist" className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                  Checklist
                </TabsTrigger>
                <TabsTrigger value="notes" className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="activity" className="h-14 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/80 bg-background p-3">
                    <div className="mb-2 flex items-center gap-2 text-destructive">
                      <AlertTriangleIcon className="h-4 w-4" />
                      <span className="text-xs font-bold">Issues</span>
                    </div>
                    <p className="text-3xl font-bold">{openIssues.length}</p>
                    <p className="text-xs font-semibold text-destructive">{highIssues.length} high priority</p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background p-3">
                    <div className="mb-2 flex items-center gap-2 text-status-warning">
                      <CircleAlertIcon className="h-4 w-4" />
                      <span className="text-xs font-bold">Mismatches</span>
                    </div>
                    <p className="text-3xl font-bold">{mediumIssues.length}</p>
                    <p className="text-xs font-semibold text-muted-foreground">Medium priority</p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background p-3">
                    <div className="mb-2 flex items-center gap-2 text-primary">
                      <FileIcon className="h-4 w-4" />
                      <span className="text-xs font-bold">Missing files</span>
                    </div>
                    <p className="text-3xl font-bold">{missingRequiredItems.length}</p>
                    <p className="text-xs font-semibold text-muted-foreground">To be provided</p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold">Case readiness score</span>
                    <span className="font-bold">{data.latestEvaluation?.overallScore ?? "Pending"}</span>
                  </div>
                  <Progress value={data.latestEvaluation?.overallScore ?? 0} className="h-2" />
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Review issues</h3>
                    <RiskBadge riskLevel={data.latestEvaluation?.riskLevel ?? app.riskLevel} />
                  </div>
                  {data.latestEvaluation ? (
                    <div className="space-y-2">
                      {data.latestEvaluation.redFlags.slice(0, 5).map((issue, index) => (
                        <div key={`${issue}-${index}`} className="rounded-xl border border-border/80 bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{issue}</p>
                              <p className="mt-1 text-xs text-muted-foreground">From the latest passport, form, and evidence check.</p>
                            </div>
                            <IssueSeverityBadge severity={index < 2 ? "high" : "medium"} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      Upload the passport, form, and evidence, then run review.
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Missing files</h3>
                    <span className="text-xs font-bold text-primary">View all</span>
                  </div>
                  {missingRequiredItems.length > 0 ? (
                    missingRequiredItems.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CircleIcon className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{item.documentName}</span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-border/80 bg-background p-3 text-sm text-muted-foreground">
                      Every required document has at least one uploaded file.
                    </p>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-border/80 bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold">Client fix list</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {hasReport ? "A draft list is available." : "Generate after missing files or reviewer notes."}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full">
                      {CLIENT_REPORT_STATUS_META[
                        app.clientReportStatus as keyof typeof CLIENT_REPORT_STATUS_META
                      ]?.label ?? "Not Started"}
                    </Badge>
                  </div>
                  {primaryApplicant ? (
                    <EvaluationTrigger
                      applicationId={app.id}
                      applicantId={primaryApplicant.id}
                      hasDocuments={hasDocuments}
                      rerun={hasEvaluation}
                    />
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="checklist" className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-xl border border-border/80 bg-background p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">Required files uploaded</p>
                    <span className="text-sm font-bold">{completionPercent}%</span>
                  </div>
                  <Progress value={completionPercent} className="h-2" />
                  <p className="mt-2 text-xs text-muted-foreground">{uploadedRequiredCount}/{requiredItems.length || 0} required documents uploaded.</p>
                </div>

                <div className="space-y-2">
                  {data.checklistItems.map((item) => {
                    const itemDocs = docsByChecklistItem.get(item.id) ?? [];
                    return (
                      <div key={item.id} className="rounded-xl border border-border/80 bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold">{item.documentName}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                            <p className="mt-2 text-xs font-semibold text-muted-foreground">{itemDocs.length} file{itemDocs.length === 1 ? "" : "s"}</p>
                          </div>
                          {primaryApplicant ? (
                            <DocumentUpload
                              applicationId={app.id}
                              applicantId={primaryApplicant.id}
                              checklistItemId={item.id}
                              label={itemDocs.length ? "Add" : "Upload"}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/80 bg-background p-4">
                    <h3 className="text-sm font-bold">Applicant</h3>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <p><span className="font-semibold text-foreground">Name:</span> {primaryApplicant?.name ?? "Not set"}</p>
                      <p><span className="font-semibold text-foreground">Nationality:</span> {primaryApplicant?.nationality ?? "Not set"}</p>
                      <p><span className="font-semibold text-foreground">Passport:</span> {primaryApplicant?.passportNumber ?? "Not set"}</p>
                      <p><span className="font-semibold text-foreground">Previous approvals:</span> {primaryApplicant?.approvedBefore ? `${primaryApplicant.approvedVisaType ?? "Visa"} (${primaryApplicant.approvedYear ?? "year not set"})` : "None recorded"}</p>
                      <p><span className="font-semibold text-foreground">Previous rejections:</span> {primaryApplicant?.rejectedBefore ? `${primaryApplicant.rejectedVisaType ?? "Visa"} (${primaryApplicant.rejectedYear ?? "year not set"})` : "None recorded"}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-background p-4">
                    <h3 className="text-sm font-bold">Reviewer</h3>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <ReviewerAvatar
                        name={reviewerName}
                        email={assignedReviewer?.user?.email ?? null}
                        avatar={assignedReviewer?.user?.avatar ?? null}
                      />
                      <PriorityBadge priority={app.priority} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-background p-4">
                    <h3 className="text-sm font-bold">Add issue</h3>
                    <div className="mt-3">
                      <AddReviewIssueForm applicationId={app.id} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {[
                    { label: "Case created", date: app.createdAt, icon: PlusIcon },
                    { label: "Client submitted files", date: app.submittedAt, icon: FileTextIcon },
                    { label: "Review completed", date: app.reviewCompletedAt, icon: CheckCircle2Icon },
                    { label: "Marked ready for submission", date: app.finalSubmissionAt, icon: Clock3Icon },
                  ].map((event) => (
                    <div key={event.label} className="flex gap-3 rounded-xl border border-border/80 bg-background p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
                        <event.icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold">{event.label}</p>
                        <p className="text-xs text-muted-foreground">{formatShortDate(event.date)}</p>
                      </div>
                    </div>
                  ))}

                  {data.issues.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      <h3 className="text-sm font-bold">Open issues</h3>
                      {data.issues.map((issue) => (
                        <div key={issue.id} className="rounded-xl border border-border/80 bg-background p-3">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{issue.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                            </div>
                            <IssueSeverityBadge severity={issue.severity} />
                          </div>
                          <ReviewIssueStatusSelect issueId={issue.id} status={issue.status} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </section>
      </main>
    </>
  );
}
