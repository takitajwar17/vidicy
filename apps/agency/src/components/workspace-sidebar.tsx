"use client";

import { useEffect } from "react";
import * as React from "react";
import DashboardLogo from "@/components/dashboard-logo";
import {
  HelpCircleIcon,
  LifeBuoyIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  ScanTextIcon,
  ApertureIcon,
  UsersIcon,
  SettingsIcon,
  ShieldIcon,
  MegaphoneIcon,
} from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import type { Route } from "next";
import { useSessionStore } from "@/state/session";
import { useRouter } from "next/navigation";

const defaultUser = { name: "User", email: "", avatar: "" };

export function WorkspaceSidebar({
  appId,
  user,
  isAdmin = false,
  announcementsUnreadCount = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  appId: string;
  user?: { name: string; email: string; avatar: string };
  isAdmin?: boolean;
  announcementsUnreadCount?: number;
}) {
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const unreadSupportCount = useSessionStore((s) => s.session?.unreadSupportTicketsCount);
  const adminUnreadSupportCount = useSessionStore((s) => s.session?.adminUnreadSupportTicketsCount);

  useEffect(() => {
    // Warm likely-next routes to reduce perceived latency on sidebar/tab transitions.
    const likelyRoutes: Route[] = [
      `/dashboard/${appId}`,
      `/dashboard/${appId}/checklist`,
      `/dashboard/${appId}/evaluation`,
      `/dashboard/${appId}/atlas`,
      `/dashboard/${appId}/members`,
      `/dashboard/${appId}/settings`,
    ] as Route[];
    for (const route of likelyRoutes) {
      router.prefetch(route);
    }
  }, [appId, router]);

  const workspaceItems = [
    { title: "Overview", url: `/dashboard/${appId}`, icon: LayoutDashboardIcon },
    { title: "Checklist", url: `/dashboard/${appId}/checklist`, icon: LayoutListIcon },
    { title: "Evaluation", url: `/dashboard/${appId}/evaluation`, icon: ScanTextIcon },
    { title: "Atlas", url: `/dashboard/${appId}/atlas`, icon: ApertureIcon },
  ];

  const manageItems = [
    { title: "Applicants", url: `/dashboard/${appId}/members`, icon: UsersIcon },
    { title: "Settings", url: `/dashboard/${appId}/settings`, icon: SettingsIcon },
  ];

  const accountItems: {
    title: string;
    url: string;
    icon: typeof HelpCircleIcon;
    badge?: number | string | null;
  }[] = [
    {
      title: "Get Help",
      url: "/dashboard/support",
      icon: HelpCircleIcon,
      badge: unreadSupportCount || null,
    },
    {
      title: "Announcements",
      url: "/dashboard/announcements",
      icon: MegaphoneIcon,
      badge: announcementsUnreadCount || null,
    },
  ];

  if (isAdmin) {
    accountItems.unshift(
      { title: "Admin", url: "/admin", icon: ShieldIcon },
      {
        title: "Support Inbox",
        url: "/admin/support",
        icon: LifeBuoyIcon,
        badge: adminUnreadSupportCount || null,
      },
    );
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="pb-1">
        <SidebarMenu>
          <SidebarMenuItem className="mt-1">
            <Link
              href={"/" as Route}
              onClick={() => setOpenMobile(false)}
              className="w-full flex justify-start rounded-lg px-2.5 py-2 hover:bg-sidebar-primary/12 transition-colors"
            >
              <DashboardLogo className="w-[96px] h-auto" />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-1.5">
        <NavMain items={workspaceItems} label="Workspace" />
        <NavSecondary items={manageItems} label="Manage" />
        <NavSecondary items={accountItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user || defaultUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
