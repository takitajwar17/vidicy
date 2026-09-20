import "server-only";

import { getSessionFromCookie } from "@/utils/auth";
import { APPLICATION_PERMISSIONS, ROLES_ENUM } from "@/db/schema";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { cookies } from "next/headers";
import { getApplicationAccessForCurrentSession } from "@/utils/application-auth";
import { getAnnouncementsUnreadCountForUser } from "@/server/announcements";

/**
 * A server component wrapper for AppSidebar / WorkspaceSidebar.
 * If the user has an active workspace (lastActiveApp cookie), renders the
 * WorkspaceSidebar so navigation to account-level pages doesn't reset the sidebar.
 */
export async function SiteSidebar() {
  const [session, cookieStore] = await Promise.all([getSessionFromCookie(), cookies()]);

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

  const lastActiveApp = cookieStore.get("lastActiveApp")?.value;
  const isLikelyAppId = /^vapp_[a-z0-9]+$/i.test(lastActiveApp ?? "");

  // Validate that the cookie still points to a real app the current user can access.
  // Clears stale-cookie bugs without assuming workspace access is owner-only.
  if (lastActiveApp && isLikelyAppId) {
    let hasAccess = false;

    // D1 can occasionally return transient timeout/reset errors under load.
    // Retry once, then fail open to AppSidebar so dashboard pages still render.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const access = await getApplicationAccessForCurrentSession(
          lastActiveApp,
          APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
        );
        hasAccess = access.hasAccess;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isTransientD1Timeout =
          message.includes("D1 DB storage operation exceeded timeout") ||
          message.includes("D1_ERROR");

        if (!isTransientD1Timeout || attempt === 1) {
          console.warn("SiteSidebar: failed to validate lastActiveApp cookie", {
            userId: session.user.id,
            lastActiveApp,
            attempt: attempt + 1,
            error: message,
          });
          break;
        }
      }
    }

    if (hasAccess) {
      return (
        <WorkspaceSidebar
          appId={lastActiveApp}
          user={userProps}
          isAdmin={isAdmin}
          announcementsUnreadCount={announcementsUnreadCount}
        />
      );
    }
  }

  return (
    <AppSidebar
      user={userProps}
      isAdmin={isAdmin}
      announcementsUnreadCount={announcementsUnreadCount}
    />
  );
}
