import { Button } from "@/components/ui/button";
import { AuthShell } from "../_components/auth-shell";
import Link from "next/link";

export default function NotFound() {
  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Invalid verification link</h1>
        <p className="text-sm text-muted-foreground">
          This link has expired, is incomplete, or was already used. Sign in to request a new
          verification email.
        </p>
      </div>
      <Button className="w-full" asChild>
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button variant="outline" className="w-full" asChild>
        <Link href="/">Home</Link>
      </Button>
    </AuthShell>
  );
}
