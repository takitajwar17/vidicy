"use client";

import * as React from "react";
import DashboardLogo from "@/components/dashboard-logo";
import {
  HelpCircleIcon,
  LifeBuoyIcon,
  LayoutDashboardIcon,
  ShieldIcon,
  ActivityIcon,
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

const defaultUser = {
  name: "User",
  email: "",
  avatar: "",
};

export function AppSidebar({
  user,
  isAdmin = false,
  announcementsUnreadCount = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: { name: string; email: string; avatar: string };
  isAdmin?: boolean;
  announcementsUnreadCount?: number;
}) {
  const { setOpenMobile } = useSidebar();
  const unreadSupportCount = useSessionStore((s) => s.session?.unreadSupportTicketsCount);
  const adminUnreadSupportCount = useSessionStore((s) => s.session?.adminUnreadSupportTicketsCount);

  const navMain: { title: string; url: string; icon: typeof LayoutDashboardIcon }[] = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboardIcon,
    },
  ];

  const secondaryItems: {
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
    secondaryItems.unshift(
      {
        title: "Admin",
        url: "/admin",
        icon: ShieldIcon,
      },
      {
        title: "Support Inbox",
        url: "/admin/support",
        icon: LifeBuoyIcon,
        badge: adminUnreadSupportCount || null,
      },
    );
    secondaryItems.push({
      title: "System Status",
      url: "/admin/status",
      icon: ActivityIcon,
    });
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
        <NavMain items={navMain} />
        <NavSecondary items={secondaryItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user || defaultUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
