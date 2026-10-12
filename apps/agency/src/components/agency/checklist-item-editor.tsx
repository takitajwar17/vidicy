"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { mutateChecklistItemAction } from "@/actions/checklist-management.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { PlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  getChecklistRequirement,
  type ChecklistRequirementInput,
  type ChecklistRequirementType,
  type ChecklistApplicability,
} from "@/lib/checklist-state";
import type { ChecklistMutation } from "@/lib/checklist-input";

interface ChecklistItemEditorProps {
  applicationId: string;
  expectedHash: string;
  applicants: { id: string; name: string }[];
  item?: ChecklistRequirementInput & { documentName: string; description: string };
}

export function ChecklistItemEditor({
  applicationId,
  expectedHash,
  applicants,
  item,
}: ChecklistItemEditorProps) {
  const csrfToken = useCsrfToken();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const requirement = item ? getChecklistRequirement(item) : null;
  const [draft, setDraft] = useState({
    documentName: item?.documentName ?? "",
    description: item?.description ?? "",
    applicantId: item ? (item.applicantId ?? "shared") : (applicants[0]?.id ?? "shared"),
    requirementType: requirement?.requirementType ?? "required",
    applicability: requirement?.applicability ?? "applies",
    requirementCondition: item?.requirementCondition ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const { execute, isPending } = useServerAction(mutateChecklistItemAction);
  async function save(mutation: ChecklistMutation) {
    if (!csrfToken) {
      setError(
        "Reload the page to restore the security token. Your changes are still in this form.",
      );
      return;
    }
    setError(null);
    const [result, failure] = await execute({ csrfToken, mutation });
    if (failure) {
      setError(
        failure.message || "The checklist could not be saved. Your changes are still in this form.",
      );
      return;
    }
    if (result) {
      setOpen(false);
      if (!item)
        setDraft((current) => ({
          ...current,
          documentName: "",
          description: "",
          requirementCondition: "",
        }));
      toast.success(
        mutation.operation === "remove"
          ? "Checklist item removed. Uploaded files were kept."
          : "Checklist item saved.",
      );
      router.refresh();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save({
      operation: "save",
      applicationId,
      expectedHash,
      ...draft,
      applicantId: draft.applicantId === "shared" ? null : draft.applicantId,
      ...(item ? { itemId: item.id } : {}),
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            size={item ? "icon" : "sm"}
            variant={item ? "ghost" : "default"}
            className={
              item
                ? "size-10 text-muted-foreground hover:text-foreground focus-visible:bg-muted"
                : undefined
            }
            aria-label={item ? "Edit item" : undefined}
            title={item ? "Edit item" : undefined}
          >
            {item ? <PencilIcon /> : <PlusIcon />}
            {item ? null : "Add checklist item"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{item ? "Edit checklist item" : "Add checklist item"}</DialogTitle>
            <DialogDescription>
              Set the document requirement and who must provide it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-name`}>Document name</Label>
              <Input
                id={`${id}-name`}
                required
                maxLength={255}
                value={draft.documentName}
                onChange={(event) => setDraft({ ...draft, documentName: event.target.value })}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-description`}>What to provide</Label>
              <Textarea
                id={`${id}-description`}
                maxLength={4000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-person`}>Applicant</Label>
              <NativeSelect
                className="w-full min-w-0"
                id={`${id}-person`}
                disabled={Boolean(item)}
                value={draft.applicantId}
                onChange={(event) => setDraft({ ...draft, applicantId: event.target.value })}
              >
                <option value="shared">Shared by all applicants</option>
                {applicants.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-requirement`}>Requirement</Label>
              <NativeSelect
                className="w-full min-w-0"
                id={`${id}-requirement`}
                value={draft.requirementType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    requirementType: event.target.value as ChecklistRequirementType,
                  })
                }
              >
                <option value="required">Required</option>
                <option value="recommended">Recommended</option>
                <option value="conditional">Conditional</option>
                <option value="unknown">Not determined</option>
              </NativeSelect>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-applicability`}>Applies to this case</Label>
              <NativeSelect
                className="w-full min-w-0"
                id={`${id}-applicability`}
                value={draft.applicability}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    applicability: event.target.value as ChecklistApplicability,
                  })
                }
              >
                <option value="applies">Yes</option>
                <option value="does_not_apply">No</option>
                <option value="unknown">Need more details</option>
              </NativeSelect>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`${id}-condition`}>Condition or reason</Label>
              <Input
                id={`${id}-condition`}
                maxLength={2000}
                value={draft.requirementCondition}
                onChange={(event) =>
                  setDraft({ ...draft, requirementCondition: event.target.value })
                }
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              {item ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mr-auto text-muted-foreground hover:text-destructive"
                  disabled={isPending}
                  onClick={() =>
                    void save({ operation: "remove", applicationId, expectedHash, itemId: item.id })
                  }
                >
                  <Trash2Icon />
                  Remove item
                </Button>
              ) : null}

              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {error && !open ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
