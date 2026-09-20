"use client";

import { useEffect, useMemo } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { useApplicationsStore } from "@/state/applications";

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Sweden: "SE",
  Denmark: "DK",
  Norway: "NO",
  Finland: "FI",
  Switzerland: "CH",
  Austria: "AT",
  Belgium: "BE",
  Ireland: "IE",
  "New Zealand": "NZ",
  Japan: "JP",
  Singapore: "SG",
  "South Korea": "KR",
  "EU / Schengen Area": "EU",
};

function CountryFlag({ country }: { country: string; size?: string }) {
  const code = COUNTRY_CODES[country];
  if (!code) return <span className="text-base">📄</span>;
  return (
    <ReactCountryFlag
      countryCode={code}
      svg
      style={{
        width: "150%",
        height: "150%",
        borderRadius: "50%",
        objectFit: "cover",
        display: "block",
      }}
      title={country}
    />
  );
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useServerAction } from "zsa-react";
import { getVisaApplicationsLiteAction } from "@/actions/application.action";

type Application = {
  id: string;
  name: string | null;
  destinationCountry: string;
  visaType: string;
};

/**
 * Sidebar application switcher — fetches the user's applications directly via
 * server action so no membership-based session state is required.
 */
export function ApplicationSwitcher() {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  const { applications, isLoaded, lastFetchedAt, setApplications } = useApplicationsStore();

  const { execute: fetchApplications } = useServerAction(
    getVisaApplicationsLiteAction,
  );

  useEffect(() => {
    const APPLICATIONS_CACHE_TTL_MS = 60_000;
    const hasFreshCache =
      isLoaded &&
      lastFetchedAt !== null &&
      Date.now() - lastFetchedAt < APPLICATIONS_CACHE_TTL_MS;

    if (hasFreshCache) return;

    let cancelled = false;
    fetchApplications()
      .then(([data]) => {
        if (!cancelled && data) {
          setApplications(data);
        }
      })
      .catch(() => {
        // Non-critical: switcher will show stale data from store
      });

    return () => {
      cancelled = true;
    };
  }, [fetchApplications, isLoaded, lastFetchedAt, setApplications]);

  // Preserve only workspace sub-paths (where [appId] is a real application ID).
  // This avoids carrying unrelated paths like /dashboard/applications/new.
  const subPath = useMemo(() => {
    const match = pathname.match(/^\/dashboard\/(vapp_[^/]+)(\/.*)?$/);
    if (!match) return null;
    return match[2] ?? "";
  }, [pathname]);

  // Derive active app from workspace URLs only: /dashboard/vapp_xxx/...
  const activeAppId = useMemo(() => {
    const match = pathname.match(/^\/dashboard\/(vapp_[^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const activeApp = useMemo(
    () =>
      (activeAppId ? applications.find((a) => a.id === activeAppId) : null) ??
      applications[0] ??
      null,
    [activeAppId, applications],
  );

  function getDisplayName(app: Application): string {
    return (
      app.name || `${app.destinationCountry} — ${app.visaType} Visa`
    ).replace(/— ([a-z])/, (_, c: string) => `— ${c.toUpperCase()}`);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
                {activeApp ? (
                  <CountryFlag
                    country={activeApp.destinationCountry}
                    size="2em"
                  />
                ) : (
                  <span className="text-sm">📄</span>
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeApp ? getDisplayName(activeApp) : "My Applications"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {applications.length} application
                  {applications.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-full max-w-[280px] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Applications
            </DropdownMenuLabel>
            {applications.length > 0 ? (
              applications.map((application) => (
                <DropdownMenuItem
                  key={application.id}
                  onClick={() => {
                    setOpenMobile(false);
                    const targetSubPath = subPath ?? "/checklist";
                    router.push(
                      `/dashboard/${application.id}${targetSubPath}` as string as never,
                    );
                  }}
                  className={`gap-2 p-2 cursor-pointer ${application.id === activeApp?.id ? "bg-accent" : ""}`}
                >
                  <div className="flex size-6 aspect-square items-center justify-center rounded-full border overflow-hidden flex-shrink-0">
                    <CountryFlag
                      country={application.destinationCountry}
                      size="1.6em"
                    />
                  </div>
                  {getDisplayName(application)}
                </DropdownMenuItem>
              ))
            ) : isLoaded ? (
              <DropdownMenuItem disabled className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  <span className="text-sm">📄</span>
                </div>
                No applications yet
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  <span className="text-sm">⏳</span>
                </div>
                Loading…
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2 cursor-pointer" asChild>
              <Link
                href="/dashboard/applications/new"
                onClick={() => setOpenMobile(false)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  New application
                </div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
