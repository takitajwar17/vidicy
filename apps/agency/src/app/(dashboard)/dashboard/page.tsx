import type { Metadata } from "next";
import { requireVerifiedPageSession } from "@/utils/auth-page";

export const metadata: Metadata = {
  title: "Applications",
};
import { getDB } from "@/db";
import { visaApplicationTable, applicantTable, applicationMembershipTable } from "@/db/schema";
import { eq, desc, isNull, and, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusIcon,
  FolderOpenIcon,
  LayoutListIcon,
  ScanTextIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { Route } from "next";

const FEATURE_CARDS = [
  {
    icon: LayoutListIcon,
    title: "Smart Checklist",
    desc: "Embassy-specific documents tailored to your case",
  },
  {
    icon: ScanTextIcon,
    title: "AI Evaluation",
    desc: "Identify risks and improve before submission",
  },
  {
    icon: RefreshCwIcon,
    title: "Iterative Loop",
    desc: "Re-upload and track progress to a strong application",
  },
] as const;

export default async function DashboardPage() {
  const session = await requireVerifiedPageSession();

  const db = getDB();

  // Fetch apps owned by user + apps where user is a linked applicant/member
  const [ownedApps, linkedApplicantRows, membershipRows] = await Promise.all([
    db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(
        and(
          eq(visaApplicationTable.userId, session.user.id),
          isNull(visaApplicationTable.trashedAt),
        ),
      )
      .orderBy(desc(visaApplicationTable.createdAt))
      .limit(20),
    db
      .select({ applicationId: applicantTable.applicationId })
      .from(applicantTable)
      .where(eq(applicantTable.userId, session.user.id)),
    db
      .select({ applicationId: applicationMembershipTable.applicationId })
      .from(applicationMembershipTable)
      .where(
        and(
          eq(applicationMembershipTable.userId, session.user.id),
          eq(applicationMembershipTable.isActive, 1),
        ),
      ),
  ]);

  const ownedIds = new Set(ownedApps.map((a) => a.id));
  const extraIds = Array.from(
    new Set(
      [...linkedApplicantRows, ...membershipRows]
        .map((r) => r.applicationId)
        .filter((id) => !ownedIds.has(id)),
    ),
  );

  let applications = ownedApps;
  if (extraIds.length > 0) {
    const extraApps = await db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(
        and(inArray(visaApplicationTable.id, extraIds), isNull(visaApplicationTable.trashedAt)),
      )
      .orderBy(desc(visaApplicationTable.createdAt));
    applications = [...ownedApps, ...extraApps];
  }

  // Redirect to last active workspace first
  const cookieStore = await cookies();
  const lastActiveApp = cookieStore.get("lastActiveApp")?.value;
  if (lastActiveApp && applications.some((a) => a.id === lastActiveApp)) {
    redirect(`/dashboard/${lastActiveApp}` as string as never);
  }

  // Fall back to most recent application
  if (applications.length > 0) {
    redirect(`/dashboard/${applications[0].id}` as string as never);
  }

  // No applications — show create CTA
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-16 md:py-20">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 to-primary/5 shadow-sm">
        <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl opacity-30" />
        <FolderOpenIcon className="relative z-10 h-10 w-10 text-primary" />
      </div>
      <div className="max-w-md space-y-2 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">No applications yet</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Get a personalised document checklist, AI-powered evaluation, and an expert chatbot to
          prepare the strongest possible visa application.
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {FEATURE_CARDS.map(({ icon: Icon, title, desc }) => (
          <Card
            key={title}
            data-interactive
            className="text-center"
          >
            <CardContent className="flex flex-col items-center gap-3 pt-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <p className="text-sm font-semibold tracking-tight">{title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Link href={"/dashboard/applications/new" as Route}>
        <Button size="lg" className="gap-2 shadow-sm">
          <PlusIcon className="h-4 w-4" />
          Start Your First Application
        </Button>
      </Link>
    </div>
  );
}
