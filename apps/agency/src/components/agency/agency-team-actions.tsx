"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Loader2Icon, UserMinusIcon, UserPlusIcon } from "lucide-react";

import {
  disableAgencyStaffAction,
  updateAgencyStaffRoleAction,
} from "@/actions/agency-case.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogClose,
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
import { AGENCY_STAFF_ROLE } from "@/db/schema";

export function AddStaffDialog({ disabled = false }: { disabled?: boolean }) {
  if (disabled)
    return (
      <Button disabled>
        <UserPlusIcon className="h-4 w-4" />
        Invite staff
      </Button>
    );
  return (
    <Button asChild>
      <Link href="/settings/agency#invitations">
        <UserPlusIcon className="h-4 w-4" />
        Invite staff
      </Link>
    </Button>
  );
}

export function StaffRoleSelect({
  staffMemberId,
  role,
  disabled = false,
}: {
  staffMemberId: string;
  role: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [value, setValue] = useState(role);
  const { execute, isPending } = useServerAction(updateAgencyStaffRoleAction);

  useEffect(() => {
    setValue(role);
  }, [role]);

  async function handleChange(nextRole: string) {
    if (!csrfToken) return;
    setValue(nextRole);
    const [, error] = await execute({
      staffMemberId,
      csrfToken,
      role: nextRole as (typeof AGENCY_STAFF_ROLE)[keyof typeof AGENCY_STAFF_ROLE],
    });

    if (error) {
      toast.error(error.message ?? "Could not update role.");
      setValue(role);
      return;
    }

    router.refresh();
  }

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled || isPending || !csrfToken}
    >
      <SelectTrigger aria-label="Staff role" className="h-9 bg-card text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AGENCY_STAFF_ROLE.MEMBER}>Member</SelectItem>
        <SelectItem value={AGENCY_STAFF_ROLE.ADMIN}>Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function DisableStaffButton({
  staffMemberId,
  disabled = false,
}: {
  staffMemberId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const { execute, isPending } = useServerAction(disableAgencyStaffAction);
  const [open, setOpen] = useState(false);

  async function handleDisable() {
    if (!csrfToken) return;
    const [, error] = await execute({ staffMemberId, csrfToken });
    if (error) {
      toast.error(error.message ?? "Could not disable staff member.");
      return;
    }
    setOpen(false);
    toast.success("Staff member disabled.");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || isPending || !csrfToken}
        >
          <UserMinusIcon className="h-4 w-4" />
          Disable
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable staff access?</DialogTitle>
          <DialogDescription>
            This staff member will lose access to agency cases. Their existing work will remain
            saved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleDisable}
            disabled={disabled || isPending || !csrfToken}
          >
            {isPending ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <UserMinusIcon className="h-4 w-4" />
            )}
            {isPending ? "Disabling…" : "Disable access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
