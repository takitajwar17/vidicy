"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Smartphone, Lock, KeyRound } from "lucide-react";
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

  return (
    <div className="w-full flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <Tabs value={pathname}>
          <TabsList className="grid w-full grid-cols-3 sm:flex">
            {settingsNavItems.map((item) => (
              <TabsTrigger key={item.href} value={item.href} asChild>
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Button asChild variant="outline" size="sm" className="shrink-0 self-end whitespace-nowrap">
        <Link href={"/forgot-password" as Route}>
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">Change password</span>
          <span className="sm:hidden">Password</span>
        </Link>
      </Button>
    </div>
  );
}
