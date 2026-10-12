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
  PlusIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import {
  AddReviewIssueDialog,
  AgencyCaseToolbar,
  AgencyCaseStatusSelect,
  AgencyCaseAssignmentSelect,
} from "@/components/agency/agency-case-actions";
import { PriorityBadge, ReviewerAvatar, formatShortDate } from "@/components/agency/agency-ui";
import { AgencyCaseWorkspace } from "@/components/agency/agency-case-workspace";
import { RouteReviewDetails } from "@/components/agency/route-review-details";
import { ChecklistResearchDetails } from "@/components/agency/checklist-research-details";
import { ChecklistItemEditor } from "@/components/agency/checklist-item-editor";
import {
  getReviewAvailability,
  getRequirementLabel,
  getChecklistRequirement,
} from "@/lib/checklist-state";
import { ChecklistGenerator } from "@/components/visa/checklist-generator";
import { DocumentUpload } from "@/components/visa/document-upload";
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer";
import { Button } from "@/components/ui/button";
import { EvaluationTrigger } from "@/components/visa/evaluation-trigger";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import {
  formatAgencyVisaLabel,
  getDisplayCaseNumber,
  isOpenReviewIssueStatus,
} from "@/lib/agency-workflow";
import { getAgencyCaseDetail } from "@/server/agency-data";
import { buildReviewContextHash, buildReviewRouteContext } from "@/server/review-context";
import { buildRouteAssessment, canMarkCaseReady, resolveReviewRoute } from "@/lib/review-rubric";
import {
  getChecklistItemDescription,
  getApplicantChecklistDescription,
} from "@/lib/checklist-research";
import { readRouteReviewSettings, ROUTE_FACT_LABELS } from "@/lib/route-review-input";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";
import styles from "@/components/agency/agency-case-workspace.module.css";

function getPersonName(
  user: { firstName: string | null; lastName: string | null; email: string | null } | null,
) {
  if (!user) return null;
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || null;
}

export async function AgencyCaseContent({ appId }: { appId: string }) {
  await requireApplicationPagePermission(appId, "access_application");

  const data = await getAgencyCaseDetail(appId);
  const app = data.application;

  if (!app || app.trashedAt) {
    notFound();
  }

  const primaryApplicant = data.primaryApplicant;
  const showApplicantNames = data.applicants.length > 1;
  const assignedReviewer =
    data.staff.find((member) => member.userId === app.assignedReviewerId && member.user) ?? null;
  const docsByChecklistItem = new Map<string, typeof data.documents>();

  for (const document of data.documents) {
    if (!document.checklistItemId) continue;
    const existing = docsByChecklistItem.get(document.checklistItemId) ?? [];
    existing.push(document);
    docsByChecklistItem.set(document.checklistItemId, existing);
  }

  const hasChecklist = data.checklistItems.length > 0;
  const requiredItems = data.checklistItems.filter((item) => item.isRequired);
  const progressItems = requiredItems.length ? requiredItems : data.checklistItems;
  const uploadedItemCount = progressItems.filter((item) => docsByChecklistItem.has(item.id)).length;
  const progressLabel = requiredItems.length ? "Required files" : "Checklist files";
  const completionPercent = progressItems.length
    ? Math.round((uploadedItemCount / progressItems.length) * 100)
    : 0;
  const missingRequiredItems = requiredItems.filter((item) => !docsByChecklistItem.has(item.id));
  const unresolvedItems = data.checklistItems.filter(
    (item) => getChecklistRequirement(item).unresolved,
  );
  const openIssues = data.issues.filter((issue) => isOpenReviewIssueStatus(issue.status));
  const caseNumber = getDisplayCaseNumber(app.caseNumber, app.id);
  const hasUsableDocuments = data.applicants.some(
    (person) =>
      getReviewAvailability({
        applicantId: person.id,
        items: data.checklistItems,
        documents: data.documents,
      }).canReview,
  );
  const hasEvaluation = Boolean(data.latestEvaluation);
  const route = resolveReviewRoute(app);
  const snapshot = {
    application: app,
    applicants: data.applicants,
    checklistItems: data.checklistItems,
    documents: data.documents,
  };
  const routeAssessment = primaryApplicant
    ? buildRouteAssessment({
        context: buildReviewRouteContext({ ...snapshot, applicantId: primaryApplicant.id }),
        asOfDate: new Date().toISOString().slice(0, 10),
      })
    : null;
  const routeCanSubmit = data.canSubmit && canMarkCaseReady(routeAssessment);
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
  const blockedReason = app.finalSubmissionAt
    ? "This case was submitted."
    : !hasUsableDocuments
      ? "Upload usable evidence for every applicant before marking ready."
      : !hasEvaluation
        ? "Complete a review of the current files first."
        : missingRequiredItems.length
          ? "Complete required evidence first."
          : unresolvedItems.length
            ? "Complete the case details or edit unresolved checklist requirements first."
            : openIssues.length
              ? "Resolve or dismiss open issues first."
              : !routeCanSubmit
                ? "Complete the current review and outstanding route checks before you mark this case ready."
                : null;

  return (
    <div className={styles.workspace} aria-label="Application review workspace">
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/applications", label: "Applications" },
          { href: `/dashboard/${app.id}`, label: `Case ${caseNumber}` },
        ]}
      />
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className={styles.title}>
              {primaryApplicant?.name || app.clientName || `Case ${caseNumber}`}
            </h1>
            <AgencyCaseStatusSelect applicationId={app.id} status={app.agencyStatus} />
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
      <div className={styles.workspaceBody}>
        <Suspense fallback={<p className="p-6">Loading case workspace…</p>}>
          <AgencyCaseWorkspace
            applicationId={app.id}
            issues={data.issues}
            documents={documentRows}
            missingCount={missingRequiredItems.length}
            isReviewStale={data.isReviewStale}
            defaultTab={hasUsableDocuments ? "review" : "checklist"}
            blockedReason={blockedReason}
            checklist={
              <>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Document checklist</h2>
                    <p className={styles.sectionDescription}>
                      Collect the files needed for this case.
                    </p>
                  </div>
                  {!app.finalSubmissionAt ? (
                    <ChecklistItemEditor
                      applicationId={app.id}
                      expectedHash={buildReviewContextHash(snapshot)}
                      applicants={data.applicants}
                    />
                  ) : null}
                </div>
                {hasChecklist ? (
                  <div className="mb-4">
                    <ChecklistResearchDetails application={app} applicants={data.applicants} />
                  </div>
                ) : null}
                {data.applicants
                  .filter(
                    (person) => !data.checklistItems.some((item) => item.applicantId === person.id),
                  )
                  .map((person) => (
                    <Suspense key={person.id} fallback={<p>Loading checklist controls...</p>}>
                      <ChecklistGenerator
                        applicationId={app.id}
                        applicantId={person.id}
                        applicantName={person.name}
                        showApplicantName={showApplicantNames}
                      />
                    </Suspense>
                  ))}
                {hasChecklist ? (
                  <div className={styles.checklistProgress}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{progressLabel} uploaded</p>
                      <span className="text-sm font-semibold">{completionPercent}%</span>
                    </div>
                    <Progress value={completionPercent} className="h-2" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {uploadedItemCount}/{progressItems.length}{" "}
                      {requiredItems.length
                        ? "required documents uploaded."
                        : "checklist items have files."}
                    </p>
                  </div>
                ) : null}

                <div className={styles.checklistRows}>
                  {data.checklistItems.map((item) => {
                    const itemDocs = docsByChecklistItem.get(item.id) ?? [];
                    return (
                      <article key={item.id} className={styles.checklistRow}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{item.documentName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {getRequirementLabel(item)}
                            </p>
                            {showApplicantNames && item.applicantId ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {data.applicants.find((person) => person.id === item.applicantId)
                                  ?.name ?? "Applicant"}
                              </p>
                            ) : null}
                            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                              {getApplicantChecklistDescription({
                                description: item.description,
                                applicantName:
                                  !showApplicantNames && item.origin !== "staff"
                                    ? primaryApplicant?.name
                                    : undefined,
                              })}
                            </p>
                            <p className="mt-2 text-xs font-semibold text-muted-foreground">
                              {itemDocs.length} file{itemDocs.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className={styles.checklistActions}>
                            {!app.finalSubmissionAt ? (
                              <ChecklistItemEditor
                                applicationId={app.id}
                                expectedHash={buildReviewContextHash(snapshot)}
                                applicants={data.applicants}
                                item={{
                                  ...item,
                                  description: getChecklistItemDescription(item.description),
                                }}
                              />
                            ) : null}
                            {!app.finalSubmissionAt && (item.applicantId || primaryApplicant) ? (
                              <DocumentUpload
                                applicationId={app.id}
                                applicantId={item.applicantId ?? primaryApplicant!.id}
                                checklistItemId={item.id}
                                label={itemDocs.length ? "Replace file" : "Upload"}
                              />
                            ) : null}
                          </div>
                        </div>
                        {itemDocs.length ? (
                          <ul
                            aria-label={`Uploaded files for ${item.documentName}`}
                            className="mt-3 space-y-2 border-t border-border/60 pt-3"
                          >
                            {itemDocs.map((document, index) => (
                              <li key={document.id}>
                                <DocumentPreviewDrawer
                                  documentId={document.id}
                                  fileName={document.fileName}
                                  fileSize={document.fileSize}
                                  mimeType={document.mimeType}
                                  uploadedAt={document.uploadedAt}
                                  isActive={index === 0}
                                  hasMultipleVersions={itemDocs.length > 1}
                                  sectionLabel={item.documentName}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            }
            details={
              <>
                <RouteReviewDetails
                  applicationId={app.id}
                  expectedHash={buildReviewContextHash(snapshot)}
                  initialRoute={{
                    destinationCountry: app.destinationCountry,
                    visaType: app.visaType,
                  }}
                  initial={readRouteReviewSettings(app.settings)}
                  applicants={data.applicants}
                />
                <details
                  aria-label="Route guidance and official sources"
                  className={styles.routeGuidance}
                >
                  <summary>
                    <span>Route guidance and official sources</span>
                    <span className={styles.guidanceStatus}>
                      {route.status === "unresolved"
                        ? "Exact route needed"
                        : "Approved route guidance"}
                    </span>
                  </summary>
                  <div className={styles.guidanceBody}>
                    <h3 className="text-sm font-semibold">Route requirements</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {route.label}.{" "}
                      {route.status === "unresolved"
                        ? "Select the exact destination and visa route before you mark the case ready."
                        : "The review uses the approved route guidance and supplied evidence. Complete the required files and resolve open issues before you mark the case ready."}
                    </p>
                    {routeAssessment?.missingFacts.length ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Details to record:{" "}
                        {routeAssessment.missingFacts
                          .map(
                            (key) =>
                              ROUTE_FACT_LABELS[key] ??
                              {
                                stage: "process stage",
                                subtype: "exact category",
                                applicationDate: "filing date",
                              }[key] ??
                              key,
                          )
                          .join(", ")}
                        .
                      </p>
                    ) : null}
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
                      {route.guidance.map((guidance) => (
                        <li key={guidance}>{guidance}</li>
                      ))}
                    </ul>
                    <ul className="mt-3 space-y-1">
                      {route.sourceUrls.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            {new URL(url).hostname}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-muted-foreground">
                      Use the guidance and sources with the case details to check which requirements
                      apply.
                    </p>
                  </div>
                </details>
              </>
            }
            detailsSidebar={
              <>
                <section className={styles.detailsCard} aria-label="Case team">
                  <h3 className={styles.cardTitle}>Reviewer</h3>
                  <div className="mt-4">
                    <ReviewerAvatar
                      name={reviewerName}
                      email={assignedReviewer?.user?.email ?? null}
                      avatar={assignedReviewer?.user?.avatar ?? null}
                    />
                  </div>
                  <div className={styles.priorityRow}>
                    <span>Case priority</span>
                    <PriorityBadge priority={app.priority} />
                  </div>
                </section>
                <section className={styles.detailsCard} aria-label="Applicant records">
                  <h3 className={styles.cardTitle}>Applicant records</h3>
                  <p className={styles.cardDescription}>Passport and previous visa decisions.</p>
                  {data.applicants.length ? (
                    data.applicants.map((person) => (
                      <div className={styles.personRecord} key={person.id}>
                        <h4>{person.name}</h4>
                        <dl className={styles.recordList}>
                          <div>
                            <dt>Passport</dt>
                            <dd>{person.passportNumber || "Not recorded"}</dd>
                          </div>
                          <div>
                            <dt>Previous approvals:</dt>
                            <dd>
                              {person.approvedBefore
                                ? `${person.approvedVisaType ?? "Visa"} (${person.approvedYear ?? "year not set"})`
                                : "None recorded"}
                            </dd>
                          </div>
                          <div>
                            <dt>Previous rejections:</dt>
                            <dd>
                              {person.rejectedBefore
                                ? `${person.rejectedVisaType ?? "Visa"} (${person.rejectedYear ?? "year not set"})`
                                : "None recorded"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No applicants recorded.</p>
                  )}
                </section>
              </>
            }
            reviewTools={
              <>
                {data.latestReport ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/${data.latestReport.id}` as Route}>
                      Open client report
                    </Link>
                  </Button>
                ) : null}
                <AddReviewIssueDialog applicationId={app.id} />
              </>
            }
            activity={
              <>
                <h3 className={styles.cardTitle}>Case activity</h3>
                <p className={styles.cardDescription}>Most recent first.</p>
                <ol className={styles.timeline}>
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
                  ]
                    .filter((event) => event.date)
                    .sort(
                      (left, right) => (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0),
                    )
                    .map((event) => (
                      <li key={event.label} className={styles.timelineEvent}>
                        <span className={styles.timelineIcon}>
                          <event.icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium">{event.label}</p>
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={event.date?.toISOString()}
                          >
                            {formatShortDate(event.date)}
                          </time>
                        </div>
                      </li>
                    ))}
                </ol>
              </>
            }
          />
        </Suspense>
        <div className={styles.tabActions} role="group" aria-label="Case actions">
          <AgencyCaseToolbar
            applicationId={app.id}
            hasEvaluation={hasEvaluation}
            hasChecklist={hasChecklist}
            expectedHash={buildReviewContextHash(snapshot)}
          >
            {data.applicants.map((person) => {
              const availability = getReviewAvailability({
                applicantId: person.id,
                items: data.checklistItems,
                documents: data.documents,
              });
              return (
                <Suspense key={person.id} fallback={null}>
                  <div className="flex flex-wrap items-center gap-2">
                    {showApplicantNames ? (
                      <span className="text-xs text-muted-foreground">{person.name}</span>
                    ) : null}
                    <EvaluationTrigger
                      compact
                      applicationId={app.id}
                      applicantId={person.id}
                      hasDocuments={!app.finalSubmissionAt && availability.canReview}
                      blockedReason={
                        app.finalSubmissionAt ? "This case was submitted." : availability.reason
                      }
                      blockedLabel={
                        app.finalSubmissionAt
                          ? "Case submitted"
                          : availability.state === "checklist_needed"
                            ? "Generate checklist first"
                            : availability.state === "processing"
                              ? "Processing documents"
                              : "Upload usable documents"
                      }
                      rerun={hasEvaluation || data.isReviewStale}
                    />
                  </div>
                </Suspense>
              );
            })}
          </AgencyCaseToolbar>
        </div>
      </div>
    </div>
  );
}
