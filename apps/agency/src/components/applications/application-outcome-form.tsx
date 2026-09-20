"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2Icon, XCircleIcon, PencilIcon, Loader2Icon } from "lucide-react";
import { recordOutcomeAction } from "@/actions/application.action";

const schema = z.object({
  actualOutcome: z.enum(["approved", "rejected"], { required_error: "Please select a decision" }),
  outcomeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  outcomeNotes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

interface ApplicationOutcomeFormProps {
  applicationId: string;
  initialOutcome: {
    actualOutcome: "approved" | "rejected" | null;
    outcomeDate: Date | null;
    outcomeNotes: string | null;
  } | null;
}

export function ApplicationOutcomeForm({
  applicationId,
  initialOutcome,
}: ApplicationOutcomeFormProps) {
  const router = useRouter();
  const hasInitialOutcome = !!initialOutcome?.actualOutcome;
  const [editing, setEditing] = useState(!hasInitialOutcome);

  const { execute, isPending } = useServerAction(recordOutcomeAction);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // No default selection when recording for the first time — user must choose
      actualOutcome: initialOutcome?.actualOutcome ?? undefined,
      outcomeDate: initialOutcome?.outcomeDate
        ? new Date(initialOutcome.outcomeDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      outcomeNotes: initialOutcome?.outcomeNotes ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    const [, err] = await execute({
      applicationId,
      actualOutcome: values.actualOutcome,
      outcomeDate: values.outcomeDate,
      outcomeNotes: values.outcomeNotes || null,
    });

    if (err) {
      toast.error("Failed to save outcome. Please try again.");
      return;
    }

    toast.success("Visa outcome recorded.");
    setEditing(false);
    router.refresh();
  }

  async function handleClear() {
    const [, err] = await execute({
      applicationId,
      actualOutcome: null,
      outcomeDate: null,
      outcomeNotes: null,
    });

    if (err) {
      toast.error("Failed to clear outcome.");
      return;
    }

    form.reset({ actualOutcome: undefined, outcomeDate: new Date().toISOString().slice(0, 10), outcomeNotes: "" });
    setEditing(true);
    router.refresh();
  }

  // Display-only state: outcome recorded and not in edit mode
  if (!editing && initialOutcome?.actualOutcome) {
    const isApproved = initialOutcome.actualOutcome === "approved";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {isApproved ? (
            <Badge className="gap-1.5 bg-status-info/10 text-status-info hover:bg-status-info/10 dark:bg-status-info/20 dark:text-status-info">
              <CheckCircle2Icon className="h-3.5 w-3.5" />
              Approved
            </Badge>
          ) : (
            <Badge className="gap-1.5 bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
              <XCircleIcon className="h-3.5 w-3.5" />
              Rejected
            </Badge>
          )}
          {initialOutcome.outcomeDate && (
            <span className="text-sm text-muted-foreground">
              {new Date(initialOutcome.outcomeDate as unknown as string).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        {initialOutcome.outcomeNotes && (
          <p className="text-sm text-muted-foreground">{initialOutcome.outcomeNotes}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <PencilIcon className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isPending}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        </div>
      </div>
    );
  }

  // Form state: no outcome yet, or editing existing
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="actualOutcome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Decision</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex gap-4"
                >
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="approved" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Approved</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="rejected" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Rejected</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="outcomeDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Decision Date</FormLabel>
              <FormControl>
                <input
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="outcomeNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. Rejected — insufficient financial evidence. Visa number: X12345..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending} size="sm">
            {isPending ? <><Loader2Icon className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Outcome"}
          </Button>
          {initialOutcome?.actualOutcome && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
