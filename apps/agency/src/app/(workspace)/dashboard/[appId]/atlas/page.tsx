import "server-only";
import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Atlas AI assistant",
};
import { getDB } from "@/db";
import {
  chatMessageTable,
  chatConversationTable,
  visaApplicationTable,
  applicantTable,
  documentEvaluationTable,
  APPLICANT_RELATIONSHIP,
  PAYMENT_STATUS,
} from "@/db/schema";
import { eq, asc, and, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AtlasChat } from "@/components/visa/atlas-chat";
import { WorkspaceStepBar } from "@/components/visa/workspace-step-bar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { AtlasBlurOverlay } from "@/components/visa/atlas-blur-overlay";
import { getInitials } from "@/utils/name-initials";
import { generateAtlasPreview } from "@/services/atlas-prompt";
import { APPLICATION_PERMISSIONS } from "@/db/schema";
import { isTrialLocked as getIsTrialLocked } from "@/utils/application-auth";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";
import { getWorkflowStepStates } from "../_workspace-types";

export default async function AtlasPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const session = await requireApplicationPagePermission(appId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

  const db = getDB();

  const [app] = await db
    .select()
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.id, appId))
    .limit(1);

  if (!app) notFound();

  // Payment gate — free trial apps get a teaser instead of redirect
  if (app.paymentStatus !== PAYMENT_STATUS.PAID && !app.isFreeTrialApp) {
    return redirect(`/dashboard/${appId}/checkout`);
  }

  const isTrialLocked = getIsTrialLocked(app);

  // Gate: require at least one evaluation before chat is available
  const [applicants, [latestEval]] = await Promise.all([
    db
      .select()
      .from(applicantTable)
      .where(eq(applicantTable.applicationId, appId)),
    db
      .select({
        id: documentEvaluationTable.id,
        atlasPreview: documentEvaluationTable.atlasPreview,
        summary: documentEvaluationTable.summary,
        overallScore: documentEvaluationTable.overallScore,
        riskLevel: documentEvaluationTable.riskLevel,
        redFlags: documentEvaluationTable.redFlags,
        strengths: documentEvaluationTable.strengths,
        recommendations: documentEvaluationTable.recommendations,
      })
      .from(documentEvaluationTable)
      .where(eq(documentEvaluationTable.applicationId, appId))
      .orderBy(desc(documentEvaluationTable.createdAt))
      .limit(1),
  ]);

  // Generate Atlas preview on-the-fly if missing (handles pre-existing evaluations)
  let atlasPreview = latestEval?.atlasPreview as { question: string; answer: string } | null;
  if (isTrialLocked && latestEval && !atlasPreview) {
    try {
      const result = await generateAtlasPreview({
        evaluationId: latestEval.id,
        summary: latestEval.summary as string,
        overallScore: latestEval.overallScore as number,
        riskLevel: latestEval.riskLevel as string,
        redFlags: (latestEval.redFlags as string[]) ?? [],
        strengths: (latestEval.strengths as string[]) ?? [],
        recommendations: (latestEval.recommendations as string[]) ?? [],
        visaType: app.visaType,
        destinationCountry: app.destinationCountry,
      });
      if (result) atlasPreview = result;
    } catch {
      // Non-fatal — show fallback
    }
  }

  const primaryApplicant =
    applicants.find((a) => a.relationship === APPLICANT_RELATIONSHIP.PRIMARY) ??
    applicants[0];
  const currentUserName =
    `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
    session.user.email ||
    "User";
  const currentUser = {
    name: currentUserName,
    avatar: session.user.avatar ?? "",
    initials: getInitials(currentUserName) || "U",
  };

  // Load conversations for this application
  let conversations = latestEval
    ? await db.query.chatConversationTable.findMany({
        where: eq(chatConversationTable.applicationId, appId),
        orderBy: [desc(chatConversationTable.updatedAt)],
      })
    : [];

  // Auto-create a default conversation if none exist and evaluation is done
  if (latestEval && conversations.length === 0) {
    const [newConversation] = await db
      .insert(chatConversationTable)
      .values({ applicationId: appId })
      .returning();
    conversations = [newConversation];
  }

  const activeConversationId = conversations[0]?.id ?? null;

  // Load messages for the active conversation only
  const chatMessages = activeConversationId
    ? await db
        .select()
        .from(chatMessageTable)
        .where(
          and(
            eq(chatMessageTable.applicationId, appId),
            eq(chatMessageTable.conversationId, activeConversationId),
          ),
        )
        .orderBy(asc(chatMessageTable.createdAt))
    : [];

  const baseStepBarProps = {
    appId,
    currentStep: "chat" as const,
    hasEvaluation: !!latestEval,
    destinationCountry: app.destinationCountry,
    visaType: app.visaType,
    status: app.status,
    homeCountry: app.homeCountry,
    currentCountry: app.currentCountry,
    embassy: app.embassy,
    score: primaryApplicant?.readinessScore,
    riskLevel: primaryApplicant?.riskLevel,
  };
  const preEvalStepStates = getWorkflowStepStates({
    currentStep: null,
    hasChecklist: true,
    missingRequiredCount: 1,
    hasEvaluation: false,
    isTrialLocked: false,
  });
  const lockedAtlasStepStates = getWorkflowStepStates({
    currentStep: "chat",
    hasChecklist: true,
    missingRequiredCount: 0,
    hasEvaluation: true,
    isTrialLocked: true,
  });
  const readyAtlasStepStates = getWorkflowStepStates({
    currentStep: "chat",
    hasChecklist: true,
    missingRequiredCount: 0,
    hasEvaluation: true,
    isTrialLocked: false,
  });

  if (!latestEval) {
    return (
      <>
        <PageHeader
          items={[
            {
              href: `/dashboard/${appId}`,
              label: "Application",
            },
            {
              href: `/dashboard/${appId}/atlas`,
              label: "Atlas",
            },
          ]}
        />
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="mx-auto w-full max-w-screen-2xl flex flex-col gap-3 py-4 md:gap-4 md:py-5 px-4 lg:px-6">
            <WorkspaceStepBar {...baseStepBarProps} stepStates={preEvalStepStates} />
            <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full overflow-hidden bg-muted shadow-inner">
                <Image
                  src="/atlas_avatar.png"
                  alt="Atlas"
                  width={80}
                  height={80}
                  className="aspect-square h-full w-full rounded-full object-cover scale-[1.1] opacity-60"
                />
              </div>
              <div className="space-y-2 max-w-sm">
                <p className="text-lg font-semibold">Atlas is almost ready</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload your documents and run an AI evaluation first. Once
                  Atlas has reviewed your file, you can ask anything — risks,
                  missing docs, interview tips, and more.
                </p>
              </div>
              <Button
                asChild
                className="shadow-lg hover:shadow-primary/10 transition-all hover:-translate-y-0.5"
              >
                <Link href={`/dashboard/${appId}/checklist` as Route}>
                  Upload Documents
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Free trial teaser — identical to real Atlas chat layout with locked input
  if (isTrialLocked) {
    const userName = currentUser.name;
    const userInitials = currentUser.initials;
    const userAvatar = currentUser.avatar;
    return (
      <>
        <PageHeader
          items={[
            { href: `/dashboard/${appId}`, label: "Application" },
            { href: `/dashboard/${appId}/atlas`, label: "Atlas" },
          ]}
        />
        <div className="@container/main flex flex-col min-h-[calc(100svh-4rem)]">
          <div className="mx-auto w-full max-w-screen-2xl flex flex-1 flex-col">
            <div className="px-4 lg:px-6 pt-4 pb-0 md:pt-5 md:pb-0">
              <WorkspaceStepBar {...baseStepBarProps} stepStates={lockedAtlasStepStates} />
            </div>
            <div className="flex flex-1 flex-col">
              {/* Chat container — mirrors visa-chat.tsx fullScreen layout exactly */}
              <div className="relative flex flex-1 flex-col">
                {/* Message area with progressive blur from bottom */}
                <div className="relative flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto p-4" role="log" aria-label="Chat preview">
                    <div className="space-y-4">
                    {atlasPreview ? (
                      <>
                        {/* User message — exact same markup as visa-chat.tsx line 594-649 */}
                        <div className="flex flex-col gap-1 items-end">
                          <span className="text-xs font-medium text-muted-foreground pr-[60px]">
                            {userName}
                          </span>
                          <div className="flex items-end gap-3 flex-row-reverse min-w-0">
                            <Avatar className="h-8 w-8 shrink-0 rounded-full">
                              {userAvatar ? (
                                <AvatarImage
                                  src={userAvatar}
                                  alt={userName}
                                  className="aspect-square h-full w-full rounded-full object-cover"
                                />
                              ) : (
                                <AvatarFallback className="rounded-full text-xs">
                                  {userInitials}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div className="flex flex-col gap-2 items-end max-w-[75%] sm:max-w-[75%]">
                              <div className="rounded-xl px-4 py-2.5 text-sm bg-primary text-primary-foreground break-words">
                                {atlasPreview.question}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Atlas response — exact same markup as visa-chat.tsx line 653-679 */}
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs font-medium text-muted-foreground pl-[60px]">
                            Atlas
                          </span>
                          <div className="flex items-end gap-3">
                            <Avatar className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
                              <Image
                                src="/atlas_avatar.png"
                                alt="Atlas"
                                width={32}
                                height={32}
                                className="aspect-square h-full w-full rounded-full object-cover scale-[1.1]"
                              />
                            </Avatar>
                            <div className="max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground">
                              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ol:my-2 prose-li:my-1">
                                {atlasPreview.answer.split("\n\n").map((paragraph, i) => (
                                  <p key={i}>{paragraph}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Fallback — exact same loading indicator as visa-chat.tsx line 682-705 */
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-xs font-medium text-muted-foreground pl-[60px]">
                          Atlas is thinking…
                        </span>
                        <div className="flex items-end gap-3">
                          <Avatar className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
                            <Image
                              src="/atlas_avatar.png"
                              alt="Atlas"
                              width={32}
                              height={32}
                              className="aspect-square h-full w-full rounded-full object-cover scale-[1.1]"
                            />
                          </Avatar>
                          <div className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                  <AtlasBlurOverlay />
                </div>

                {/* Locked input area — exact same layout as visa-chat.tsx line 710-817 */}
                <div className="border-t p-3 space-y-2 pb-[max(12px,env(safe-area-inset-bottom))] sticky bottom-0 bg-background z-10">
                  <div className="relative">
                    <div className="flex gap-2 items-end opacity-40 pointer-events-none select-none" aria-hidden="true">
                      <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled tabIndex={-1}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </Button>
                      <div className="flex-1 min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground ring-offset-background">
                        Ask Atlas anything…
                      </div>
                      <Button size="icon" className="h-10 w-10 shrink-0" disabled tabIndex={-1}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>
                      </Button>
                    </div>
                    {/* Lock overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-md">
                      <Button asChild size="sm" className="shadow-md gap-1.5">
                        <Link href={`/dashboard/${appId}/checkout` as Route}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          Unlock Atlas &amp; Unlimited Re-evaluations
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Pay once to unlock full Atlas chat, unlimited re-evaluations, and personalized visa guidance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        items={[
          {
            href: `/dashboard/${appId}`,
            label: "Application",
          },
          {
            href: `/dashboard/${appId}/atlas`,
            label: "Atlas",
          },
        ]}
      />
      <div className="@container/main flex flex-col min-h-[calc(100svh-4rem)]">
        <div className="mx-auto w-full max-w-screen-2xl flex flex-1 flex-col">
          {/* Zero bottom padding — chat area directly abuts the step bar to maximize vertical space */}
          <div className="px-4 lg:px-6 pt-4 pb-0 md:pt-5 md:pb-0">
            <WorkspaceStepBar {...baseStepBarProps} stepStates={readyAtlasStepStates} />
          </div>
          <div className="flex flex-1 flex-col">
            <AtlasChat
              applicationId={appId}
              initialMessages={chatMessages}
              conversations={conversations}
              activeConversationId={activeConversationId!}
              currentUser={currentUser}
            />
          </div>
        </div>
      </div>
    </>
  );
}
