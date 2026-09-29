"use client"

import { MailIcon, PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
  label,
}: {
  items: {
    title: string
    url: string
    icon?: React.ElementType
    badge?: number | null
  }[]
  label?: string
}) {
  const { setOpenMobile } = useSidebar()
  const searchParams = useSearchParams()
  const applicantId = searchParams.get("applicant")

  function withApplicant(url: string): Route {
    if (!applicantId) return url as Route
    return `${url}?applicant=${applicantId}` as Route
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              tooltip="New Application"
              className="min-w-8 rounded-full border border-[var(--sidebar-action-border)] bg-[var(--sidebar-action)] text-[var(--sidebar-action-foreground)] duration-200 ease-linear hover:bg-[var(--sidebar-action-hover)] hover:text-[var(--sidebar-action-foreground)] active:bg-[var(--sidebar-action-active)]"
            >
              <Link href={"/dashboard/applications/new" as Route} onClick={() => setOpenMobile(false)}>
                <PlusCircleIcon />
                <span>New Application</span>
              </Link>
            </SidebarMenuButton>
            <Button
              size="icon"
              type="button"
              variant="outline"
              className="h-9 w-9 shrink-0 rounded-full border-[var(--sidebar-action-border)] bg-[var(--sidebar-action)] text-[var(--sidebar-action-foreground)] transition-colors hover:bg-[var(--sidebar-action-hover)] hover:text-[var(--sidebar-action-foreground)] group-data-[collapsible=icon]:opacity-0"
            >
              <MailIcon />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title}>
                <Link href={withApplicant(item.url)} onClick={() => setOpenMobile(false)}>
                  {item.icon ? <item.icon /> : null}
                  <span>{item.title}</span>
                  {item.badge ? (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-2xs font-medium text-primary-foreground">
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
  )
}
