import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FileTextIcon,
  Globe2Icon,
  IdCardIcon,
  PaperclipIcon,
  PlusIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import {
  AddReviewIssueForm,
  AgencyCaseToolbar,
  AgencyCaseStatusSelect,
  AgencyCaseAssignmentSelect,
  ReviewIssueStatusSelect,
} from "@/components/agency/agency-case-actions";
import {
  IssueSeverityBadge,
  PriorityBadge,
  ReviewerAvatar,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { AgencyCaseWorkspace } from "@/components/agency/agency-case-workspace";
import { ChecklistGenerator } from "@/components/visa/checklist-generator";
import { DocumentUpload } from "@/components/visa/document-upload";
import { EvaluationTrigger } from "@/components/visa/evaluation-trigger";
import { Progress } from "@/components/ui/progress";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CHECKLIST_ITEM_STATUS } from "@/db/schema";
import {
  formatAgencyVisaLabel,
  getDisplayCaseNumber,
  isOpenReviewIssueStatus,
} from "@/lib/agency-workflow";
import { getAgencyCaseDetail } from "@/server/agency-data";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";
import styles from "@/components/agency/agency-case-workspace.module.css";

function getPersonName(
  user: { firstName: string | null; lastName: string | null; email: string | null } | null,
) {
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
  const assignedReviewer =
    data.staff.find((member) => member.userId === app.assignedReviewerId && member.user) ?? null;
  const docsByChecklistItem = new Map<string, typeof data.documents>();

  for (const document of data.documents) {
    if (!document.checklistItemId) continue;
    const existing = docsByChecklistItem.get(document.checklistItemId) ?? [];
    existing.push(document);
    docsByChecklistItem.set(document.checklistItemId, existing);
  }

  const requiredItems = data.checklistItems.filter((item) => item.isRequired);
  const uploadedRequiredCount = requiredItems.filter((item) =>
    isUploadedStatus(item.status),
  ).length;
  const completionPercent =
    requiredItems.length > 0 ? Math.round((uploadedRequiredCount / requiredItems.length) * 100) : 0;
  const missingRequiredItems = requiredItems.filter((item) => !docsByChecklistItem.has(item.id));
  const openIssues = data.issues.filter((issue) => isOpenReviewIssueStatus(issue.status));
  const highIssues = openIssues.filter((issue) => issue.severity === "high");
  const mediumIssues = openIssues.filter((issue) => issue.severity === "medium");
  const caseNumber = getDisplayCaseNumber(app.caseNumber, app.id);
  const hasDocuments = data.documents.length > 0;
  const hasEvaluation = Boolean(data.latestEvaluation);
  const reviewerName = getPersonName(assignedReviewer?.user ?? null);

  const documentRows = data.documents.map((document) => ({
    id: document.id,
    applicantId: document.applicantId,
    checklistItemId: document.checklistItemId,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    pageCount: document.pageCount,
    extractionStatus: document.extractionStatus,
  }));
  const staffOptions = data.staff.flatMap((member) =>
    member.userId
      ? [
          {
            userId: member.userId,
            label: getPersonName(member.user) ?? member.email ?? "Agency staff",
          },
        ]
      : [],
  );
  const blockedReason = !hasEvaluation
    ? "Complete a review of the current files first."
    : missingRequiredItems.length
      ? "Complete required evidence first."
      : openIssues.length
        ? "Resolve or dismiss open issues first."
        : null;

  return (
    <div className={styles.workspace} aria-label="Application review workspace">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className="min-w-0">
            <div className={styles.caseNumber}>
              <SidebarTrigger className="size-7" />
              <Link href="/dashboard/applications" className="hover:text-primary">
                Applications
              </Link>
              <span>/</span>
              <span>Case {caseNumber}</span>
              <AgencyCaseStatusSelect applicationId={app.id} status={app.agencyStatus} />
            </div>
            <h1 className={styles.title}>
              {primaryApplicant?.name || app.clientName || `Case ${caseNumber}`}
            </h1>
          </div>
          <div className={styles.dates}>
            <p>Created {formatShortDate(app.createdAt)}</p>
            <p>Last updated {formatShortDate(app.updatedAt)}</p>
          </div>
        </div>
        <div className={styles.facts}>
          <span className={styles.fact}>
            <Globe2Icon />
            {formatAgencyVisaLabel({
              destinationCountry: app.destinationCountry,
              visaType: app.visaType,
            })}
          </span>
          {app.clientName && app.clientName !== primaryApplicant?.name ? (
            <span className={styles.fact}>
              <UsersIcon />
              Client: {app.clientName}
            </span>
          ) : null}
          {primaryApplicant?.dateOfBirth ? (
            <span className={styles.fact}>
              <CalendarDaysIcon />
              DOB {primaryApplicant.dateOfBirth}
            </span>
          ) : null}
          {primaryApplicant?.passportNumber ? (
            <span className={styles.fact}>
              <IdCardIcon />
              Passport {primaryApplicant.passportNumber}
            </span>
          ) : null}
          <span className={styles.fact}>
            <UserRoundIcon />
            <span className="text-muted-foreground">Assigned to</span>
            <AgencyCaseAssignmentSelect
              applicationId={app.id}
              assignedReviewerId={app.assignedReviewerId}
              staff={staffOptions}
            />
          </span>
        </div>
      </header>
      <Suspense fallback={<p className="p-6">Loading case workspace…</p>}>
        <AgencyCaseWorkspace
          applicationId={app.id}
          issues={data.issues}
          documents={documentRows}
          missingCount={missingRequiredItems.length}
          isReviewStale={data.isReviewStale}
          defaultTab={data.checklistItems.length ? "review" : "checklist"}
          checklist={
            <>
              {data.checklistItems.length === 0 && primaryApplicant ? (
                <Suspense fallback={<p>Loading checklist controls...</p>}>
                  <ChecklistGenerator
                    applicationId={app.id}
                    applicantId={primaryApplicant.id}
                    applicantName={primaryApplicant.name}
                  />
                </Suspense>
              ) : null}
              <div className="mb-4 rounded-xl border border-border/80 bg-background p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Required files uploaded</p>
                  <span className="text-sm font-bold">{completionPercent}%</span>
                </div>
                <Progress value={completionPercent} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {uploadedRequiredCount}/{requiredItems.length || 0} required documents uploaded.
                </p>
              </div>

              <div className="space-y-2">
                {data.checklistItems.map((item) => {
                  const itemDocs = docsByChecklistItem.get(item.id) ?? [];
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/80 bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{item.documentName}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {item.description}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            {itemDocs.length} file{itemDocs.length === 1 ? "" : "s"}
                          </p>
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
            </>
          }
          notes={
            <>
              <div className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-background p-4">
                  <h3 className="text-sm font-bold">Applicant</h3>
                  <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">Name:</span>{" "}
                      {primaryApplicant?.name ?? "Not set"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Nationality:</span>{" "}
                      {primaryApplicant?.nationality ?? "Not set"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Passport:</span>{" "}
                      {primaryApplicant?.passportNumber ?? "Not set"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Previous approvals:</span>{" "}
                      {primaryApplicant?.approvedBefore
                        ? `${primaryApplicant.approvedVisaType ?? "Visa"} (${primaryApplicant.approvedYear ?? "year not set"})`
                        : "None recorded"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Previous rejections:</span>{" "}
                      {primaryApplicant?.rejectedBefore
                        ? `${primaryApplicant.rejectedVisaType ?? "Visa"} (${primaryApplicant.rejectedYear ?? "year not set"})`
                        : "None recorded"}
                    </p>
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
              {data.latestReport ? (
                <div className="mt-4 rounded-md border border-border p-4">
                  <h3 className="text-sm font-semibold">Client fix list</h3>
                  <Link
                    href={`/dashboard/reports/${data.latestReport.id}` as Route}
                    className="mt-2 block text-xs text-primary underline"
                  >
                    Open client report
                  </Link>
                </div>
              ) : null}
            </>
          }
          activity={
            <>
              <div className="space-y-3">
                {[
                  { label: "Case created", date: app.createdAt, icon: PlusIcon },
                  { label: "Client submitted files", date: app.submittedAt, icon: FileTextIcon },
                  {
                    label: "Review completed",
                    date: app.reviewCompletedAt,
                    icon: CheckCircle2Icon,
                  },
                  {
                    label: "Marked ready for submission",
                    date: app.finalSubmissionAt,
                    icon: Clock3Icon,
                  },
                ].map((event) => (
                  <div
                    key={event.label}
                    className="flex gap-3 rounded-xl border border-border/80 bg-background p-3"
                  >
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
                    <h3 className="text-sm font-bold">Tracked issues</h3>
                    {data.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-xl border border-border/80 bg-background p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold">{issue.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {issue.description}
                            </p>
                          </div>
                          <IssueSeverityBadge severity={issue.severity} />
                        </div>
                        <ReviewIssueStatusSelect issueId={issue.id} status={issue.status} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          }
        />
      </Suspense>
      <footer className={styles.footer}>
        <div className={styles.metrics}>
          <div className={styles.score}>
            <span>Readiness score</span>
            <Progress
              value={data.latestEvaluation?.overallScore ?? 0}
              className={
                data.latestEvaluation && data.latestEvaluation.overallScore < 65
                  ? "[&>div]:bg-destructive"
                  : ""
              }
            />
            <strong>
              {data.latestEvaluation ? `${data.latestEvaluation.overallScore} / 100` : "Pending"}
            </strong>
          </div>
          <span>
            <FileTextIcon />
            {openIssues.length} open issues{" "}
            <span className="hidden 2xl:inline">
              ({highIssues.length} high, {mediumIssues.length} medium)
            </span>
          </span>
          <span>
            <PaperclipIcon />
            {missingRequiredItems.length} required files missing
          </span>
        </div>
        <AgencyCaseToolbar
          applicationId={app.id}
          hasEvaluation={hasEvaluation}
          blockedReason={blockedReason}
        >
          {primaryApplicant ? (
            <Suspense fallback={null}>
              <EvaluationTrigger
                applicationId={app.id}
                applicantId={primaryApplicant.id}
                hasDocuments={hasDocuments}
                rerun={hasEvaluation || data.isReviewStale}
                className={styles.secondaryButton}
              />
            </Suspense>
          ) : null}
        </AgencyCaseToolbar>
      </footer>
    </div>
  );
}
