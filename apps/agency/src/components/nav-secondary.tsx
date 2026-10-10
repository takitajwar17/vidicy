"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getActiveNavigationUrl } from "@/lib/navigation";
import type { Route } from "next";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavSecondary({
  items,
  label,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
    badge?: number | string | null;
  }[];
  label?: string;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { setOpenMobile } = useSidebar();
  const activeUrl = getActiveNavigationUrl({ pathname: usePathname(), items });

  return (
    <SidebarGroup {...props}>
      {label && (
        <SidebarGroupLabel className="px-2.5 text-2xs uppercase tracking-[0.14em] text-sidebar-foreground/55">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className="rounded-[5px] px-2.5"
                isActive={activeUrl === item.url}
              >
                <Link
                  href={item.url as Route}
                  aria-current={activeUrl === item.url ? "page" : undefined}
                  onClick={() => setOpenMobile(false)}
                >
                  <item.icon />
                  <span>{item.title}</span>
                  {item.badge ? (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1 text-2xs font-medium text-sidebar-primary-foreground">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
