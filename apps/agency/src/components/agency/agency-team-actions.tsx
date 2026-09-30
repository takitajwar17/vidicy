"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Loader2Icon, SendIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";

import {
  addAgencyStaffAction,
  disableAgencyStaffAction,
  updateAgencyStaffRoleAction,
} from "@/actions/agency-case.action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGENCY_STAFF_ROLE } from "@/db/schema";

export function AddStaffDialog({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <UserPlusIcon className="h-4 w-4" />
          Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Add a reviewer or admin to the agency team. They can sign in immediately with this email.
          </DialogDescription>
        </DialogHeader>
        <AddStaffForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddStaffForm({
  disabled = false,
  onSuccess,
}: {
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(AGENCY_STAFF_ROLE.MEMBER);
  const { execute, isPending } = useServerAction(addAgencyStaffAction);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [result, error] = await execute({
      email,
      role: role as (typeof AGENCY_STAFF_ROLE)[keyof typeof AGENCY_STAFF_ROLE],
    });

    if (error) {
      toast.error(error.message ?? "Could not add staff member.");
      return;
    }

    toast.success(result?.emailSent === false ? "Staff member added. Email notification failed." : "Staff member added.");
    setEmail("");
    setRole(AGENCY_STAFF_ROLE.MEMBER);
    onSuccess?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label className="flex h-5 items-end text-xs font-bold text-muted-foreground">Work email</Label>
        <Input
          className="h-10"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="reviewer@agency.com"
          disabled={disabled}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label className="flex h-5 items-end text-xs font-bold text-muted-foreground">Role</Label>
        <Select value={role} onValueChange={setRole} disabled={disabled}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AGENCY_STAFF_ROLE.MEMBER}>Member</SelectItem>
            <SelectItem value={AGENCY_STAFF_ROLE.ADMIN}>Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="h-10 justify-center" disabled={disabled || isPending}>
        {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
        Add staff
      </Button>
    </form>
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
  const [value, setValue] = useState(role);
  const { execute, isPending } = useServerAction(updateAgencyStaffRoleAction);

  useEffect(() => {
    setValue(role);
  }, [role]);

  async function handleChange(nextRole: string) {
	    setValue(nextRole);
	    const [, error] = await execute({
	      staffMemberId,
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
    <Select value={value} onValueChange={handleChange} disabled={disabled || isPending}>
      <SelectTrigger className="h-9 rounded-xl bg-card text-xs">
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
  const { execute, isPending } = useServerAction(disableAgencyStaffAction);

  async function handleDisable() {
    const [, error] = await execute({ staffMemberId });
    if (error) {
      toast.error(error.message ?? "Could not disable staff member.");
      return;
    }
    toast.success("Staff member disabled.");
    router.refresh();
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleDisable} disabled={disabled || isPending}>
      {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <UserMinusIcon className="h-4 w-4" />}
      Disable
    </Button>
  );
}
