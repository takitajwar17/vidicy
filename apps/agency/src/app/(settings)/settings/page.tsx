import type { Metadata } from "next";
import { requireVerifiedPageSession } from "@/utils/auth-page";

export const metadata: Metadata = {
  title: "Settings",
};
import { SettingsForm } from "./settings-form";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ThemeSwitch from "@/components/theme-switch";
import { AccountDetailsCard } from "@/components/settings/account-details-card";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";

function SettingsFormSkeleton() {
  return (
    <Card>
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
    <Card>
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
      {/* Personal Info + Account Details side by side */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <Suspense fallback={<SettingsFormSkeleton />}>
          <SettingsForm />
        </Suspense>
        <Suspense fallback={<AccountDetailsSkeleton />}>
          <AccountDetailsCard />
        </Suspense>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the application looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Interface Theme</span>
              <p className="text-xs text-muted-foreground">
                Select your preferred theme for the dashboard.
              </p>
            </div>
            <ThemeSwitch>Select Theme</ThemeSwitch>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone — Account deletion & data export (GDPR) */}
      <DangerZoneCard />
    </div>
  );
}
