"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateApplicantRoleAction } from "@/actions/applicant.action";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

interface ApplicantRoleSelectProps {
  applicationId: string;
  applicantId: string;
  currentRole: string;
  disabled?: boolean;
}

export function ApplicantRoleSelect({
  applicationId,
  applicantId,
  currentRole,
  disabled = false,
}: ApplicantRoleSelectProps) {
  const router = useRouter();

  const { execute, isPending } = useServerAction(updateApplicantRoleAction, {
    onSuccess: () => {
      toast.success("Role updated.");
      router.refresh();
    },
    onError: ({ err }) => {
      toast.error(err.message ?? "Failed to update role.");
    },
  });

  return (
    <Select
      value={currentRole}
      disabled={disabled || isPending}
      onValueChange={(role) =>
        execute({ applicationId, applicantId, role: role as "owner" | "admin" | "member" | "guest" })
      }
    >
      <SelectTrigger className="h-7 w-28 text-xs border-dashed">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value} className="text-xs">
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
