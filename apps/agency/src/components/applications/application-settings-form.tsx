"use client";

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
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateApplicationSettingsAction, deleteApplicationAction } from "@/actions/application.action";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
});

type FormValues = z.infer<typeof schema>;

interface ApplicationSettingsFormProps {
  applicationId: string;
  initialName: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function ApplicationSettingsForm({
  applicationId,
  initialName,
  canEdit,
  canDelete,
}: ApplicationSettingsFormProps) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialName,
    },
  });

  const { execute: execUpdate, isPending: isUpdating } = useServerAction(updateApplicationSettingsAction, {
    onSuccess: () => {
      toast.success("Settings saved");
      router.refresh();
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to save settings");
    },
  });

  const { execute: execDelete, isPending: isDeleting } = useServerAction(deleteApplicationAction, {
    onSuccess: () => {
      toast.success("Application deleted");
      router.push("/dashboard");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to delete application");
    },
  });

  function onSubmit(values: FormValues) {
    execUpdate({
      applicationId,
      name: values.name,
    });
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Application Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. United States — Tourist Visa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      )}

      {canDelete && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-destructive">Delete Application</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently delete this application and all its data. This action cannot be undone.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete Application"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Application?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the application, all members, roles, documents, and related data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => execDelete({ applicationId })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
