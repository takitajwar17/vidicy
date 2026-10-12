"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { signOutAction } from "@/actions/sign-out.action";
import { useSessionStore } from "@/state/session";
import {
  createAgencyAction,
  joinAgencyAction,
  leaveAgencyAction,
  previewAgencyInviteAction,
} from "@/actions/agency-membership.action";
import { AuthShell } from "../_components/auth-shell";
import { useCsrfToken } from "@/components/csrf-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DisabledMembership {
  agencyName: string;
}

function DisabledMembershipNotice({ membership }: { membership: DisabledMembership }) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { execute, isPending } = useServerAction(leaveAgencyAction);

  async function leave() {
    if (!csrfToken) return;
    setErrorMessage("");
    const [result, error] = await execute({ csrfToken });
    if (error || !result) {
      setErrorMessage(error?.message ?? "Could not leave the agency. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your agency access is disabled</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          You still belong to {membership.agencyName}. Contact an agency admin for help, or leave
          the agency before you create or join another agency.
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            Leave agency
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave {membership.agencyName}?</DialogTitle>
            <DialogDescription>
              Your work will remain with the agency. You will need a new invitation to join it
              again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={leave}
              disabled={isPending || !csrfToken}
            >
              {isPending ? "Leaving…" : "Confirm leave"}
            </Button>
          </DialogFooter>
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface InvitePreview {
  agencyName: string;
  expiresAt: string;
  code: string;
}

export default function AgencySetupClient({
  initialCode = "",
  redirectPath = "/dashboard",
  disabledMembership = null,
}: {
  initialCode?: string;
  redirectPath?: string;
  disabledMembership?: DisabledMembership | null;
}) {
  const csrfToken = useCsrfToken();
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const create = useServerAction(createAgencyAction);
  const check = useServerAction(previewAgencyInviteAction);
  const join = useServerAction(joinAgencyAction);
  const signOut = useServerAction(signOutAction);
  const clearSession = useSessionStore((state) => state.clearSession);
  const isPending = create.isPending || check.isPending || join.isPending || signOut.isPending;

  async function handleSignOut() {
    if (!csrfToken) return;
    const [, error] = await signOut.execute({ csrfToken });
    if (error) {
      toast.error(error.message || "Could not sign out. Try again.");
      return;
    }
    clearSession();
    window.location.replace("/sign-in");
  }

  const headerAction = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-sm text-muted-foreground hover:text-foreground"
      onClick={handleSignOut}
      disabled={isPending || !csrfToken}
      aria-busy={signOut.isPending}
    >
      {signOut.isPending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
      {signOut.isPending ? "Signing out…" : "Sign out"}
    </Button>
  );

  function openDashboard() {
    // Membership changes invalidate routes visited before the user had access.
    window.location.replace(redirectPath);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setErrorMessage("");
    const [result, error] = await create.execute({ name: name.trim(), csrfToken });
    if (error || !result) {
      setErrorMessage(error?.message ?? "Could not create the agency. Try again.");
      return;
    }
    openDashboard();
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setErrorMessage("");
    setPreview(null);
    const [result, error] = await check.execute({ code: code.trim(), csrfToken });
    if (error || !result) {
      setErrorMessage(error?.message ?? "Could not check this invite code. Try again.");
      return;
    }
    setPreview({ ...result, code: code.trim() });
  }

  async function handleJoin() {
    if (!preview || !csrfToken) return;
    setErrorMessage("");
    const [result, error] = await join.execute({ code: preview.code, csrfToken });
    if (error || !result) {
      setErrorMessage(error?.message ?? "Could not join the agency. Try again.");
      return;
    }
    openDashboard();
  }

  if (disabledMembership) {
    return (
      <AuthShell headerAction={headerAction}>
        <DisabledMembershipNotice membership={disabledMembership} />
      </AuthShell>
    );
  }

  return (
    <AuthShell headerAction={headerAction}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your agency</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Create a separate agency for your work, or use an invitation to join your team.
        </p>
      </div>
      <Tabs defaultValue={initialCode ? "join" : "create"} className="space-y-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create agency</TabsTrigger>
          <TabsTrigger value="join">Join agency</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-agency-name">Agency name</Label>
              <Input
                id="new-agency-name"
                autoComplete="organization"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              You will own this agency. Its cases, clients, and documents will be separate from
              other agencies.
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || !csrfToken || !name.trim()}
            >
              {create.isPending ? "Creating agency…" : "Create agency"}
            </Button>
          </form>
        </TabsContent>
        <TabsContent value="join" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Invite codes expire after 7 days and can be used once.
          </p>
          <form onSubmit={handlePreview} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agency-invite-code">Invite code</Label>
              <Input
                id="agency-invite-code"
                value={code}
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                disabled={isPending}
                onChange={(event) => {
                  setCode(event.target.value);
                  setPreview(null);
                }}
                required
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={isPending || !csrfToken || !code.trim()}
            >
              {check.isPending ? "Checking code…" : "Check invite code"}
            </Button>
          </form>
          {preview && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <div>
                <p className="text-sm text-muted-foreground">You are invited to join</p>
                <h2 className="mt-1 text-lg font-semibold">{preview.agencyName}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Check the agency name before you join. You will join as a Member. This code can be
                used once.
              </p>
              <p className="text-xs text-muted-foreground">
                Expires{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Dhaka",
                }).format(new Date(preview.expiresAt))}{" "}
                (Dhaka)
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={handleJoin}
                disabled={isPending || !csrfToken}
              >
                {join.isPending ? "Joining agency…" : "Join this agency"}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </AuthShell>
  );
}
