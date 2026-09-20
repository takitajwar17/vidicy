"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Fragment } from "react";
import { ApplicationSwitcher } from "@/components/application-switcher";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface BreadcrumbItem {
  href: string;
  label: string;
}

interface PageHeaderProps {
  items: BreadcrumbItem[];
}

export function PageHeader({ items }: PageHeaderProps) {
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith("/admin");
  const isSupportPage = pathname.startsWith("/dashboard/support");
  const showAppSwitcher = !isAdminPage && !isSupportPage;

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/92 backdrop-blur transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-3 md:px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {/* Breadcrumb key uses href+index to avoid React key collisions
                when multiple items share the same href (e.g. "Application" → "Checklist" both link to /dashboard/[appId]) */}
            {items.map((item, index) => (
              <Fragment key={`${item.href}-${index}`}>
                <BreadcrumbItem
                  className={index < items.length - 1 ? "hidden md:block" : ""}
                >
                  <BreadcrumbLink asChild>
                    <Link href={item.href as Route}>{item.label}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {index < items.length - 1 && (
                  <BreadcrumbSeparator className="hidden md:block" />
                )}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {showAppSwitcher && (
        <div className="flex shrink-0 items-center gap-2 px-3 md:px-4 min-w-0 max-w-[320px] justify-end">
          <ApplicationSwitcher />
        </div>
      )}
    </header>
  );
}
