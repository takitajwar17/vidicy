import "server-only";

import Link from "next/link";
import type { Route } from "next";

import { requireVerifiedPageSession } from "@/utils/auth-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default async function SecurityPage() {
  await requireVerifiedPageSession();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Security
        </h1>
        <p className="text-sm text-muted-foreground">
          Password access and account safeguards for the review desk.
        </p>
      </div>

      <Card className="rounded-xl border-border/80 shadow-[var(--shadow-dashboard)]">
        <CardHeader>
          <CardTitle>Account protection</CardTitle>
          <CardDescription>
            Keep sign-in access current for the people reviewing client files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Password reset</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send yourself a secure reset link before changing the password on this account.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href={"/forgot-password" as Route}>Change password</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
