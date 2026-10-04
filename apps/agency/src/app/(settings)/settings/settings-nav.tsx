"use client";

import type { Route } from 'next'
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Smartphone,
  Lock,
  KeyRound,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SettingsNavItem {
  title: string;
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    title: "Profile",
    href: "/settings",
    icon: User,
  },
  {
    title: "Security",
    href: "/settings/security",
    icon: Lock,
  },
  {
    title: "Sessions",
    href: "/settings/sessions",
    icon: Smartphone,
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isLgAndSmaller = useMediaQuery('LG_AND_SMALLER')

  return (
    <div className="w-full flex items-center justify-between gap-4">
      <div
        className={
          isLgAndSmaller
            ? "whitespace-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "whitespace-nowrap"
        }
      >
        <Tabs value={pathname}>
          <TabsList className="h-auto p-1">
            {settingsNavItems.map((item) => (
              <TabsTrigger
                key={item.href}
                value={item.href}
                asChild
              >
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Button asChild variant="outline" size="sm" className="shrink-0 whitespace-nowrap">
        <Link href={"/forgot-password" as Route}>
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">Change password</span>
          <span className="sm:hidden">Password</span>
        </Link>
      </Button>
    </div>
  );
}
