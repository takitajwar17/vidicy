import type { Metadata } from "next";
import type { Route } from "next";
import { PageHeader } from "@/components/page-header";
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
    <>
      <PageHeader
        items={[
          { href: "/dashboard" as Route, label: "Dashboard" },
          { href: "/dashboard/announcements" as Route, label: "Announcements" },
        ]}
      />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <AnnouncementsFeedClient initialFeed={feed as any} isAdmin={session.user.role === "admin"} />
        </div>
      </div>
    </>
  );
}
