"use client"

import {
  BellIcon,
  HelpCircleIcon,
  LogOutIcon,
  MoreVerticalIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import Image from "next/image"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import useSignOut from "@/hooks/useSignOut"
import Link from "next/link"
import type { Route } from "next"
import { getInitials } from "@/utils/name-initials"

const defaultUser = { name: "User", email: "", avatar: "" }

export function NavUser({
  user = defaultUser,
}: {
  user?: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { signOut } = useSignOut()
  const initials = getInitials(user.name) || "U"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-auto rounded-xl border border-sidebar-border/65 bg-sidebar-primary/10 px-2.5 py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-9 w-9 rounded-xl border border-sidebar-border/70">
                {user.avatar ? (
                  <Image src={user.avatar} alt={user.name} width={36} height={36} className="aspect-square h-full w-full rounded-xl object-cover" />
                ) : (
                  <AvatarFallback className="rounded-xl bg-sidebar-primary/20 text-sidebar-foreground">{initials}</AvatarFallback>
                )}
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="text-2xs uppercase tracking-[0.12em] text-sidebar-foreground/55">
                  Account
                </span>
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/65">
                  {user.email}
                </span>
              </div>
              <MoreVerticalIcon className="ml-auto size-4 text-sidebar-foreground/70" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-xl"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2.5 px-3 py-2.5 text-left text-sm">
                <Avatar className="h-9 w-9 rounded-xl">
                  {user.avatar ? (
                    <Image src={user.avatar} alt={user.name} width={36} height={36} className="aspect-square h-full w-full rounded-xl object-cover" />
                  ) : (
                    <AvatarFallback className="rounded-xl">{initials}</AvatarFallback>
                  )}
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={"/settings" as Route} onClick={() => setOpenMobile(false)}>
                  <SettingsIcon />
                  Account Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={"/dashboard/support" as Route} onClick={() => setOpenMobile(false)}>
                  <HelpCircleIcon />
                  Help Center
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={"/dashboard/announcements" as Route} onClick={() => setOpenMobile(false)}>
                  <BellIcon />
                  Announcements
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
