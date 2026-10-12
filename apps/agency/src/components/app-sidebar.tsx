"use client";

import * as React from "react";
import DashboardLogo from "@/components/dashboard-logo";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  FileTextIcon,
  HelpCircleIcon,
  LifeBuoyIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  ShieldIcon,
  ActivityIcon,
  MegaphoneIcon,
  SettingsIcon,
  UsersIcon,
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
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useSessionStore } from "@/state/session";
import { AGENCY_NAV_ITEMS } from "@/lib/agency-workflow";

const defaultUser = {
  name: "User",
  email: "",
  avatar: "",
};

export function AppSidebar({
  user,
  agencyName,
  isAdmin = false,
  announcementsUnreadCount = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: { name: string; email: string; avatar: string };
  agencyName?: string | null;
  isAdmin?: boolean;
  announcementsUnreadCount?: number;
}) {
  const { setOpenMobile } = useSidebar();
  const isAgencyPage = usePathname() === "/dashboard/agency";
  const unreadSupportCount = useSessionStore((s) => s.session?.unreadSupportTicketsCount);
  const adminUnreadSupportCount = useSessionStore((s) => s.session?.adminUnreadSupportTicketsCount);

  const iconByTitle = {
    Dashboard: LayoutDashboardIcon,
    Applications: BriefcaseBusinessIcon,
    Clients: UsersIcon,
    Team: ShieldIcon,
    Reports: LineChartIcon,
  } as const;

  const navMain = AGENCY_NAV_ITEMS.map((item) => ({
    ...item,
    icon: iconByTitle[item.title] ?? FileTextIcon,
  }));

  const secondaryItems: {
    title: string;
    url: string;
    icon: typeof HelpCircleIcon;
    badge?: number | string | null;
  }[] = [
    {
      title: "Settings",
      url: "/settings",
      icon: SettingsIcon,
    },
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
        {agencyName ? (
          <section
            aria-label="Current agency"
            className="mx-2 min-w-0 border-t border-sidebar-border"
          >
            <Link
              href="/dashboard/agency"
              aria-label="Agency"
              aria-current={isAgencyPage ? "page" : undefined}
              onClick={() => setOpenMobile(false)}
              className="flex min-w-0 items-center gap-2 rounded-[5px] px-0.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Building2Icon
                className="size-4 shrink-0 text-sidebar-foreground/75"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-[0.12em] text-sidebar-foreground/55">
                  Agency
                </p>
                <p
                  className="mt-0.5 line-clamp-2 break-words text-sm font-medium leading-5"
                  title={agencyName}
                >
                  {agencyName}
                </p>
              </div>
            </Link>
          </section>
        ) : null}
        <NavUser user={user || defaultUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
