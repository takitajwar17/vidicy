"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import {
  deleteEmptyAgencyAction,
  leaveAgencyAction,
  transferAgencyOwnershipAction,
  updateAgencySettingsAction,
} from "@/actions/agency-membership.action";
import {
  createAgencyInvitationAction,
  resendAgencyInvitationAction,
  revokeAgencyInvitationAction,
} from "@/actions/agency-invitation.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { withSettingsConnectionError } from "@/lib/agency-settings-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgencyMember {
  id: string;
  userId: string | null;
  email: string | null;
  role: string;
  name: string | null;
}

interface AgencyInvitation {
  id: string;
  recipientEmail: string | null;
  expiresAt: Date | string;
  redeemedAt: Date | string | null;
  revokedAt: Date | string | null;
  deliveryStatus: string;
  lastDeliveryError: string | null;
  sentAt: Date | string | null;
  retryAvailableAt: string | null;
}

interface AgencySettingsClientProps {
  agency: { id: string; name: string; ownerUserId: string | null };
  members: AgencyMember[];
  invitations: AgencyInvitation[];
  isOwner: boolean;
  isAdmin: boolean;
  userId: string;
  canDeleteAgency: boolean;
}

const settingsActions = {
  save: withSettingsConnectionError(updateAgencySettingsAction),
  create: withSettingsConnectionError(createAgencyInvitationAction),
  resend: withSettingsConnectionError(resendAgencyInvitationAction),
  cancel: withSettingsConnectionError(revokeAgencyInvitationAction),
  leave: withSettingsConnectionError(leaveAgencyAction),
  transfer: withSettingsConnectionError(transferAgencyOwnershipAction),
  remove: withSettingsConnectionError(deleteEmptyAgencyAction),
};

const INVITE_RULE = "Invite codes expire after 7 days and can be used once.";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function AgencyNameForm({ name }: { name: string }) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [draft, setDraft] = useState(name);
  const { execute, isPending } = useServerAction(settingsActions.save);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    const [result, error] = await execute({ name: draft.trim(), csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not save the agency name.");
      return;
    }
    toast.success("Agency name saved.");
    router.refresh();
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Label htmlFor="agency-name">Agency name</Label>
      <Input
        id="agency-name"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={120}
        autoComplete="organization"
        required
      />
      <Button type="submit" disabled={isPending || !csrfToken || !draft.trim()}>
        {isPending ? "Saving…" : "Save agency name"}
      </Button>
    </form>
  );
}

function invitationStatus(invitation: AgencyInvitation, now: number) {
  if (invitation.revokedAt) return "Cancelled";
  if (invitation.redeemedAt) return "Used";
  if (new Date(invitation.expiresAt).getTime() <= now) return "Expired";
  return "Pending";
}

function InvitationRow({
  invitation,
  status,
  onCancelled,
}: {
  invitation: AgencyInvitation;
  status: string;
  onCancelled: (id: string) => void;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const resend = useServerAction(settingsActions.resend);
  const cancel = useServerAction(settingsActions.cancel);
  const isPending = resend.isPending || cancel.isPending;
  const [cooldownEndsAt, setCooldownEndsAt] = useState(invitation.retryAvailableAt);

  useEffect(() => {
    setCooldownEndsAt(invitation.retryAvailableAt);
  }, [invitation.retryAvailableAt]);

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const remaining = new Date(cooldownEndsAt).getTime() - Date.now();
    const timer = setTimeout(() => setCooldownEndsAt(null), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [cooldownEndsAt]);
  const isCoolingDown = Boolean(cooldownEndsAt && new Date(cooldownEndsAt).getTime() > Date.now());

  async function handleResend() {
    if (!csrfToken || isCoolingDown) return;
    const [result, error] = await resend.execute({ invitationId: invitation.id, csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not send the invitation.");
      return;
    }
    setCooldownEndsAt(new Date(Date.now() + 2 * 60_000).toISOString());
    if (result.emailSent) toast.success("Invitation email sent.");
    else toast.error("Email delivery was not confirmed. Wait two minutes, then retry.");
    router.refresh();
  }
  async function handleCancel() {
    if (!csrfToken) return;
    const [result, error] = await cancel.execute({ invitationId: invitation.id, csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not cancel the invitation.");
      return;
    }
    onCancelled(invitation.id);
    toast.success("Invitation cancelled.");
    router.refresh();
  }

  return (
    <li className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">
            {invitation.recipientEmail ?? "Invite code"}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {formatDate(invitation.expiresAt)} (Dhaka)
          </p>
          {invitation.recipientEmail && (
            <p className="text-xs text-muted-foreground">
              {invitation.deliveryStatus === "sent"
                ? "Email sent"
                : invitation.deliveryStatus === "failed"
                  ? "Email delivery failed"
                  : "Email delivery pending"}
            </p>
          )}
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{status}</span>
      </div>
      {invitation.lastDeliveryError && (
        <p className="text-sm text-destructive">{invitation.lastDeliveryError}</p>
      )}
      {status === "Pending" && (
        <div className="flex flex-wrap gap-2">
          {invitation.recipientEmail && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResend}
              disabled={isPending || !csrfToken || isCoolingDown}
            >
              {resend.isPending
                ? "Sending…"
                : isCoolingDown
                  ? "Wait two minutes before resending"
                  : invitation.deliveryStatus === "failed"
                    ? "Retry email"
                    : "Resend email"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending || !csrfToken}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel invitation"}
          </Button>
        </div>
      )}
    </li>
  );
}

function AgencyInvitations({
  invitations,
  mode,
}: {
  invitations: AgencyInvitation[];
  mode: "email" | "code";
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [email, setEmail] = useState("");
  const [generated, setGenerated] = useState<{
    invitationId: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [now, setNow] = useState(Date.now);
  const isEmail = mode === "email";
  const matchingInvitations = invitations.filter((invitation) =>
    isEmail ? Boolean(invitation.recipientEmail) : !invitation.recipientEmail,
  );
  const active = matchingInvitations.filter(
    (invitation) => invitationStatus(invitation, now) === "Pending",
  );
  const history = matchingInvitations.filter(
    (invitation) => invitationStatus(invitation, now) !== "Pending",
  );
  const generatedInvitation = invitations.find(
    (invitation) => invitation.id === generated?.invitationId,
  );
  const showGenerated =
    generated &&
    new Date(generated.expiresAt).getTime() > now &&
    (!generatedInvitation || invitationStatus(generatedInvitation, now) === "Pending");

  useEffect(() => {
    const expiries = [
      ...invitations.map((invitation) => new Date(invitation.expiresAt).getTime()),
      ...(generated ? [new Date(generated.expiresAt).getTime()] : []),
    ];
    const next = Math.min(...expiries.filter((expiry) => expiry > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [invitations, generated, now]);

  useEffect(() => {
    if (generated && !showGenerated) setGenerated(null);
  }, [generated, showGenerated]);

  useEffect(() => {
    function refreshInvitations() {
      setNow(Date.now());
    }
    window.addEventListener("focus", refreshInvitations);
    return () => window.removeEventListener("focus", refreshInvitations);
  }, []);

  function handleCancelled(id: string) {
    setGenerated((current) => (current?.invitationId === id ? null : current));
  }
  const { execute, isPending } = useServerAction(settingsActions.create);
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || (isEmail && !email.trim())) return;
    const [result, error] = await execute({ email: isEmail ? email.trim() : undefined, csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not create the invitation.");
      return;
    }
    if (!isEmail)
      setGenerated({
        invitationId: result.invitationId,
        code: result.code,
        expiresAt: result.expiresAt,
      });
    if (isEmail && !result.emailSent)
      toast.error("Invite created, but the email was not sent. You can retry it below.");
    else toast.success(isEmail ? "Invitation email sent." : "Invite code created.");
    setEmail("");
    router.refresh();
  }
  async function copyCode() {
    if (!showGenerated) return;
    try {
      await navigator.clipboard.writeText(generated.code);
      toast.success("Invite code copied.");
    } catch {
      toast.error("Could not copy. Select and copy the code.");
    }
  }
  async function copyLink() {
    if (!showGenerated) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/agency-setup?code=${encodeURIComponent(generated.code)}`,
      );
      toast.success("Invitation link copied.");
    } catch {
      toast.error("Could not copy the invitation link. Use the code instead.");
    }
  }
  return (
    <Card id={isEmail ? "invitations" : "invite-codes"} className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{isEmail ? "Invite staff by email" : "Share an invite code"}</CardTitle>
        <CardDescription>
          {isEmail
            ? "Send an invitation to one person. Only that email address can use it. Invitations expire after 7 days and can be used once."
            : `Create a code to share yourself. Any person with a verified account can use it. ${INVITE_RULE}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleCreate} className="space-y-3">
          {isEmail && (
            <>
              <Label htmlFor="agency-invite-email">Staff email address</Label>
              <Input
                id="agency-invite-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="reviewer@agency.com"
                required
              />
            </>
          )}
          <Button type="submit" disabled={isPending || !csrfToken || (isEmail && !email.trim())}>
            {isPending
              ? isEmail
                ? "Sending invitation…"
                : "Creating code…"
              : isEmail
                ? "Send email invitation"
                : "Create invite code"}
          </Button>
        </form>
        {showGenerated && (
          <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="font-medium">Your new invite code</p>
            <p className="text-sm text-muted-foreground">
              Copy this code now. It is shown only here. {INVITE_RULE}
            </p>
            <Input
              aria-label="New invite code"
              value={generated.code}
              readOnly
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Expires {formatDate(generated.expiresAt)} (Dhaka)
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyCode}>
                Copy code
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                Copy invitation link
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setGenerated(null)}>
                Hide code
              </Button>
            </div>
          </div>
        )}
        {active.length ? (
          <ul
            className="space-y-3"
            aria-label={isEmail ? "Active email invitations" : "Active invite codes"}
          >
            {active.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                status="Pending"
                onCancelled={handleCancelled}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isEmail ? "No active email invitations." : "No active invite codes."}
          </p>
        )}
        {history.length > 0 && (
          <details className="space-y-3 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium">
              {isEmail ? "Past email invitations" : "Past invite codes"} ({history.length})
            </summary>
            <ul
              className="space-y-3"
              aria-label={isEmail ? "Past email invitations" : "Past invite codes"}
            >
              {history.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  status={invitationStatus(invitation, now)}
                  onCancelled={handleCancelled}
                />
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function LeaveAgencyControl() {
  const csrfToken = useCsrfToken();
  const [open, setOpen] = useState(false);
  const { execute, isPending } = useServerAction(settingsActions.leave);
  async function leave() {
    if (!csrfToken) return;
    const [result, error] = await execute({ csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not leave the agency.");
      return;
    }
    window.location.replace("/agency-setup");
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Leave agency
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this agency?</DialogTitle>
          <DialogDescription>
            You will lose access to its cases, clients, and documents. Your work will remain with
            the agency.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending || !csrfToken}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={leave}
            disabled={isPending || !csrfToken}
          >
            {isPending ? "Leaving…" : "Leave agency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OwnershipControls({
  members,
  agencyName,
  userId,
  canDeleteAgency,
}: {
  members: AgencyMember[];
  agencyName: string;
  userId: string;
  canDeleteAgency: boolean;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [memberId, setMemberId] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const transfer = useServerAction(settingsActions.transfer);
  const remove = useServerAction(settingsActions.remove);
  const candidates = members.filter((member) => member.userId && member.userId !== userId);
  const selected = candidates.find((member) => member.id === memberId);
  async function handleTransfer() {
    if (!selected || !csrfToken) return;
    const [result, error] = await transfer.execute({ memberId: selected.id, csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not transfer ownership.");
      return;
    }
    setTransferOpen(false);
    toast.success("Agency ownership transferred.");
    router.refresh();
  }
  async function handleDelete() {
    if (deleteName !== agencyName || !csrfToken) return;
    const [result, error] = await remove.execute({ csrfToken });
    if (error || !result) {
      toast.error(error?.message ?? "Could not delete the agency.");
      return;
    }
    window.location.replace("/agency-setup");
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-medium">Transfer ownership</h3>
        <p className="text-sm text-muted-foreground">
          Choose an active staff member. You must transfer ownership before you can leave the
          agency.
        </p>
        {candidates.length ? (
          <>
            <Label htmlFor="agency-new-owner">New owner</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger id="agency-new-owner">
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name ?? member.email ?? "Staff member"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selected || transfer.isPending || !csrfToken}
                >
                  Transfer ownership
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer agency ownership?</DialogTitle>
                  <DialogDescription>
                    {selected?.name ?? selected?.email ?? "This staff member"} will become the owner
                    of {agencyName}. Your ownership will end.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" disabled={transfer.isPending || !csrfToken}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    onClick={handleTransfer}
                    disabled={transfer.isPending || !csrfToken}
                  >
                    {transfer.isPending ? "Transferring…" : "Confirm transfer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Invite a staff member before you transfer ownership.
          </p>
        )}
      </div>
      <div className="space-y-3 border-t border-border pt-5">
        <h3 className="font-medium text-destructive">Delete empty agency</h3>
        <p className="text-sm text-muted-foreground">
          You can delete an agency only when it has no cases or clients. This cannot be undone.
        </p>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              disabled={!canDeleteAgency || remove.isPending || !csrfToken}
            >
              Delete empty agency
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {agencyName}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the empty agency and its memberships. Type the agency name
                to confirm.
              </DialogDescription>
            </DialogHeader>
            <Label htmlFor="agency-delete-confirmation">Agency name</Label>
            <Input
              id="agency-delete-confirmation"
              value={deleteName}
              autoComplete="off"
              onChange={(event) => setDeleteName(event.target.value)}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={remove.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={remove.isPending || !csrfToken || deleteName !== agencyName}
              >
                {remove.isPending ? "Deleting…" : "Permanently delete agency"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function AgencySettingsClient({
  agency,
  members,
  invitations,
  isOwner,
  isAdmin,
  userId,
  canDeleteAgency,
}: AgencySettingsClientProps) {
  const router = useRouter();
  useEffect(() => {
    if (!isAdmin) return;
    function refreshInvitations() {
      router.refresh();
    }
    window.addEventListener("focus", refreshInvitations);
    return () => window.removeEventListener("focus", refreshInvitations);
  }, [router, isAdmin]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Agency details</CardTitle>
          <CardDescription>
            {isOwner
              ? "You own this agency."
              : isAdmin
                ? "You are an agency admin."
                : "Only agency admins can change these details."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <AgencyNameForm name={agency.name} />
          ) : (
            <p className="font-medium">{agency.name}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <CardDescription>People who belong to this agency.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">
                    {member.name ?? member.email ?? "Staff member"}
                    {member.userId === userId ? " (you)" : ""}
                  </p>
                  {member.name && member.email && (
                    <p className="break-words text-xs text-muted-foreground">{member.email}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {member.userId === agency.ownerUserId
                    ? "Owner"
                    : member.role === "admin"
                      ? "Admin"
                      : "Member"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {isAdmin && (
        <>
          <AgencyInvitations invitations={invitations} mode="email" />
          <AgencyInvitations invitations={invitations} mode="code" />
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{isOwner ? "Ownership" : "Your membership"}</CardTitle>
          <CardDescription>
            {isOwner
              ? "Manage who owns the agency."
              : "You can leave this agency when you no longer need access."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOwner ? (
            <OwnershipControls
              members={members}
              agencyName={agency.name}
              userId={userId}
              canDeleteAgency={canDeleteAgency}
            />
          ) : (
            <LeaveAgencyControl />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
