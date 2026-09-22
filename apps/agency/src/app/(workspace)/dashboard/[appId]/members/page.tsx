import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { hasApplicationPermission } from "@/utils/application-auth";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";

export const metadata: Metadata = {
  title: "Members",
};
import { APPLICATION_PERMISSIONS } from "@/db/schema";
import { getDB } from "@/db";
import { applicantTable, visaApplicationTable, PAYMENT_STATUS } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, MailIcon, ShieldCheck, ShieldOff } from "lucide-react";
import type { Route } from "next";
import { DeleteApplicantButton } from "@/components/applications/delete-applicant-button";
import { ApplicantRoleSelect } from "@/components/applications/applicant-role-select";
import { AddApplicantButton } from "@/components/applications/add-applicant-button";
import { EditApplicantButton } from "@/components/applications/edit-applicant-button";
import { InviteApplicantButton } from "@/components/applications/invite-applicant-button";

const RELATIONSHIP_LABELS: Record<string, string> = {
  primary: "Primary",
  spouse: "Spouse / Partner",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  other: "Other",
};

export default async function ApplicationMembersPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;

  const session = await requireApplicationPagePermission(
    appId,
    APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
  );

  const db = getDB();

  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, appId),
  });
  if (!app) notFound();

  if (app.paymentStatus !== PAYMENT_STATUS.PAID && !app.isFreeTrialApp) {
    redirect(`/dashboard/${appId}/checkout`);
  }

  // Edit button is visible to the application owner and to site admins
  const canEdit = session?.userId === app.userId || session?.user?.role === "admin";

  // Check granular permissions for UI gating (server actions enforce these too)
  const [canRemoveMembers, canChangeRoles, canInviteMembers] = await Promise.all([
    hasApplicationPermission(appId, APPLICATION_PERMISSIONS.REMOVE_MEMBERS),
    hasApplicationPermission(appId, APPLICATION_PERMISSIONS.CHANGE_MEMBER_ROLES),
    hasApplicationPermission(appId, APPLICATION_PERMISSIONS.INVITE_MEMBERS),
  ]);

  const appName =
    app.name || `${app.destinationCountry} — ${app.visaType} Visa`;

  const applicants = await db.query.applicantTable.findMany({
    where: eq(applicantTable.applicationId, appId),
    with: {
      user: {
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
  const portalAccessCount = applicants.filter((applicant) => Boolean(applicant.userId)).length;

  return (
    <>
      <PageHeader
        items={[
          { href: `/dashboard/${appId}` as Route, label: "Application" },
          { href: `/dashboard/${appId}/members` as Route, label: "Applicants" },
        ]}
      />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Page heading */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{appName}</h1>
              <p className="text-sm text-muted-foreground">
                {app.destinationCountry} — {app.visaType} Visa
              </p>
            </div>
          </div>

          {/* Stats row */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="shadow-2xs">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total applicants</p>
                    <p className="tabular-nums text-base font-semibold tracking-tight">
                      {applicants.length}
                    </p>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-muted/35">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  People currently included in this application.
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-2xs">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Portal access</p>
                    <p className="tabular-nums text-base font-semibold tracking-tight">
                      {portalAccessCount}
                    </p>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-muted/35">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Applicants who can sign in and access their portal.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Applicants list */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Applicants
                </CardTitle>
                <CardDescription>
                  All people on this application.
                </CardDescription>
              </div>
              {canInviteMembers && (
                <AddApplicantButton
                  applicationId={appId}
                  canManageBilling={session?.userId === app.userId}
                />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {applicants.length === 0 ? (
                  <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                      <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
                      <Users className="h-10 w-10 text-primary relative z-10" />
                    </div>
                    <div className="space-y-2 max-w-sm">
                      <p className="text-lg font-semibold">No applicants yet</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Add the people who will be part of this visa application
                        — primary applicant, spouse, children, or other
                        dependents.
                      </p>
                    </div>
                    {canInviteMembers && (
                      <AddApplicantButton
                        applicationId={appId}
                        canManageBilling={session?.userId === app.userId}
                      />
                    )}
                  </div>
                ) : (
                  applicants.map((applicant) => {
                    const isPrimary = applicant.relationship === "primary";
                    const hasAccess = !!applicant.userId;

                    return (
                      <div
                        key={applicant.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                      >
                        {/* Avatar + name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-9 w-9 rounded-lg shrink-0">
                            {applicant.user?.avatar ? (
                              <AvatarImage
                                src={applicant.user.avatar}
                                alt={applicant.name}
                                className="aspect-square h-full w-full rounded-lg object-cover"
                              />
                            ) : (
                              <AvatarFallback className="rounded-lg text-xs">
                                {applicant.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {applicant.name}
                            </p>
                            {applicant.email ? (
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <MailIcon className="h-3 w-3 shrink-0" />
                                {applicant.email}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                No email on file
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Relationship badge */}
                        <Badge
                          variant="outline"
                          className="capitalize font-normal text-xs bg-primary/5 text-primary border-primary/20 px-2.5 h-6 rounded-full w-fit shrink-0"
                        >
                          {RELATIONSHIP_LABELS[applicant.relationship] ??
                            applicant.relationship}
                        </Badge>

                        {/* Has Access / No Access badge */}
                        {hasAccess ? (
                          <Badge
                            variant="outline"
                            className="text-xs font-normal px-2.5 h-6 rounded-full w-fit shrink-0 gap-1 bg-status-info/10 text-status-info border-status-info/25 dark:bg-status-info/20 dark:text-status-info dark:border-status-info/35"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Has Access
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs font-normal px-2.5 h-6 rounded-full w-fit shrink-0 gap-1 bg-muted text-muted-foreground border-border"
                          >
                            <ShieldOff className="h-3 w-3" />
                            No Access
                          </Badge>
                        )}

                        {/* Role selector */}
                        {canChangeRoles ? (
                          <ApplicantRoleSelect
                            applicationId={appId}
                            applicantId={applicant.id}
                            currentRole={applicant.role}
                            disabled={isPrimary}
                          />
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal px-2.5 h-6 rounded-full w-fit shrink-0 capitalize">
                            {applicant.role}
                          </Badge>
                        )}

                        {/* Readiness score */}
                        {applicant.readinessScore !== null &&
                        applicant.readinessScore !== undefined ? (
                          <span className="text-xs tabular-nums font-medium text-muted-foreground w-16 text-right shrink-0">
                            {applicant.readinessScore}% ready
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                            No score
                          </span>
                        )}

                        {/* Invite button — shown for non-primary applicants with email but no portal access */}
                        {canInviteMembers && !isPrimary && !hasAccess && applicant.email && (
                          <InviteApplicantButton
                            applicationId={appId}
                            applicantId={applicant.id}
                            applicantName={applicant.name}
                          />
                        )}

                        {/* Delete button */}
                        {canRemoveMembers && (
                          <DeleteApplicantButton
                            applicationId={appId}
                            applicantId={applicant.id}
                            applicantName={applicant.name}
                            isPrimary={isPrimary}
                          />
                        )}

                        {/* Edit button — owners and site admins only */}
                        {canEdit && (
                          <EditApplicantButton
                            applicationId={appId}
                            applicantId={applicant.id}
                            applicantName={applicant.name}
                            isPrimary={isPrimary}
                            currentEmail={applicant.email ?? null}
                            currentNationality={applicant.nationality ?? null}
                            currentRelationship={applicant.relationship}
                            currentVisaHistory={{
                              approvedBefore:
                                applicant.approvedBefore ?? null,
                              approvedVisaType:
                                applicant.approvedVisaType ?? null,
                              approvedYear: applicant.approvedYear ?? null,
                              rejectedBefore:
                                applicant.rejectedBefore ?? null,
                              rejectedVisaType:
                                applicant.rejectedVisaType ?? null,
                              rejectedYear: applicant.rejectedYear ?? null,
                              rejectedReason:
                                applicant.rejectedReason ?? null,
                            }}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
