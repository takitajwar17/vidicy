import type { Metadata } from "next";
import { requireVerifiedPageSession } from "@/utils/auth-page";

export const metadata: Metadata = {
  title: "Profile",
};
import { SettingsForm } from "./settings-form";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeSwitch from "@/components/theme-switch";
import { AccountDetailsCard } from "@/components/settings/account-details-card";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";

const SETTINGS_CARD_CLASS = "rounded-xl border-border/80 shadow-[var(--shadow-dashboard)]";

function SettingsFormSkeleton() {
  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader>
        <div className="space-y-2">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-[200px]" />
          </div>

          <div className="flex justify-end">
            <Skeleton className="h-10 w-[100px]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDetailsSkeleton() {
  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  await requireVerifiedPageSession();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Profile
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Your profile, sign-in details, device preferences, and account controls.
        </p>
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <Suspense fallback={<SettingsFormSkeleton />}>
          <SettingsForm />
        </Suspense>
        <Suspense fallback={<AccountDetailsSkeleton />}>
          <AccountDetailsCard />
        </Suspense>
      </div>

      <Card className={SETTINGS_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how the review desk looks on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Interface Theme</span>
              <p className="text-xs text-muted-foreground">
                Pick the theme you want while reviewing client files.
              </p>
            </div>
            <ThemeSwitch>Select Theme</ThemeSwitch>
          </div>
        </CardContent>
      </Card>

      <DangerZoneCard />
    </div>
  );
}
