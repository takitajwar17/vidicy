import "server-only";

import { getSessionFromCookie } from "@/utils/auth";
import { ROLES_ENUM } from "@/db/schema";
import { AppSidebar } from "@/components/app-sidebar";
import { getAnnouncementsUnreadCountForUser } from "@/server/announcements";

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

  const announcementsUnreadCount = await getAnnouncementsUnreadCountForUser(session.user.id);

  const userProps = {
    name:
      `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
      session.user.email ||
      "User",
    email: session.user.email || "",
    avatar: session.user.avatar ?? "",
  };

  const isAdmin = session.user.role === ROLES_ENUM.ADMIN;

  if (!session.user.emailVerified) {
    return (
      <AppSidebar
        user={userProps}
        isAdmin={isAdmin}
        announcementsUnreadCount={announcementsUnreadCount}
      />
    );
  }

  return (
    <AppSidebar
      user={userProps}
      isAdmin={isAdmin}
      announcementsUnreadCount={announcementsUnreadCount}
    />
  );
}
