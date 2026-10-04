import type { Metadata } from "next";
import type { Route } from "next";
import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { getAnnouncementsFeed } from "@/server/announcements";
import { AnnouncementsFeedClient } from "@/components/announcements/announcements-feed-client";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Internal updates and communication feed",
};

export default async function AnnouncementsPage() {
  const session = await requireVerifiedPageSession();
  const feed = await getAnnouncementsFeed();

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard" as Route, label: "Dashboard" },
        { href: "/dashboard/announcements" as Route, label: "Announcements" },
      ]}
      title="Announcements"
      description="Product updates, maintenance notes, and internal messages for the review desk."
    >
      <AnnouncementsFeedClient initialFeed={feed as any} isAdmin={session.user.role === "admin"} />
    </AgencyPageShell>
  );
}
