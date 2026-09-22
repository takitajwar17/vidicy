import "server-only";

import { requireVerifiedPageSession } from "@/utils/auth-page";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default async function SecurityPage() {
  await requireVerifiedPageSession();

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1 px-1">
        <h2 className="text-xl font-semibold tracking-tight">Security</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account security settings.
        </p>
      </div>

      <Card className="bg-transparent border-dashed border-2 py-12 relative overflow-hidden">
        <CardHeader className="flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 relative">
            <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-20 scale-150" />
            <ShieldCheck className="h-10 w-10 text-primary relative z-10" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Account Secured</CardTitle>
            <CardDescription className="text-sm max-w-[320px] mx-auto leading-relaxed text-muted-foreground/80">
              Your account is protected. You can manage your password and other security settings from your profile.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
