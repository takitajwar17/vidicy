import "server-only";

import { getSessionFromCookie } from "@/utils/auth";
import { ROLES_ENUM } from "@/db/schema";
import { AppSidebar } from "@/components/app-sidebar";
import { getAnnouncementsUnreadCountForUser } from "@/server/announcements";
import { getAgencyNameForSession } from "@/server/agency-team";

/**
 * A server component wrapper for the agency navigation.
 * Agency users work from one shared review desk, so the sidebar stays stable
 * across cases.
 */
export async function SiteSidebar() {
  const session = await getSessionFromCookie();

  if (!session) {
    return null;
  }

  const [announcementsUnreadCount, agencyName] = await Promise.all([
    getAnnouncementsUnreadCountForUser(session.user.id),
    getAgencyNameForSession(session),
  ]);

  const userProps = {
    name:
      `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
      session.user.email ||
      "User",
    email: session.user.email || "",
    avatar: session.user.avatar ?? "",
  };

  const isAdmin = session.user.role === ROLES_ENUM.ADMIN;

  return (
    <AppSidebar
      user={userProps}
      agencyName={agencyName}
      isAdmin={isAdmin}
      announcementsUnreadCount={announcementsUnreadCount}
    />
  );
}
