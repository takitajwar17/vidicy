"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateUserProfileAction } from "./settings.action";
import { useEffect } from "react";
import type { SessionValidationResult } from "@/types";
import { userSettingsSchema } from "@/schemas/settings.schema";
import { useServerAction } from "zsa-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useCsrfToken } from "@/components/csrf-provider";

const SETTINGS_CARD_CLASS = "rounded-md border-border";

// zsa-react requires a result tuple even when the request itself fails.
function saveUserProfile(
  input: Parameters<typeof updateUserProfileAction>[0],
): ReturnType<typeof updateUserProfileAction> {
  return updateUserProfileAction(input).catch(
    () =>
      [
        null,
        {
          code: "ERROR",
          name: "NetworkError",
          message: "Could not save your profile. Try again.",
          data: "Could not save your profile. Try again.",
        },
      ] satisfies Awaited<ReturnType<typeof updateUserProfileAction>>,
  ) as ReturnType<typeof updateUserProfileAction>;
}

interface SettingsFormProps {
  user: Pick<
    NonNullable<SessionValidationResult>["user"],
    "id" | "firstName" | "lastName" | "email"
  >;
}

export function SettingsForm({ user }: SettingsFormProps) {
  const router = useRouter();
  const csrfToken = useCsrfToken();

  const { execute: updateUserProfile, isPending } = useServerAction(saveUserProfile, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message);
    },
    onStart: () => {
      toast.loading("Updating profile...");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Profile updated successfully");
      router.refresh();
    },
  });

  const form = useForm<z.infer<typeof userSettingsSchema>>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    },
  });

  useEffect(() => {
    // A refreshed page can update saved values without replacing an unsaved draft.
    form.reset(
      { firstName: user.firstName ?? "", lastName: user.lastName ?? "" },
      { keepDirtyValues: true },
    );
  }, [form, user.id, user.firstName, user.lastName]);

  async function onSubmit(values: z.infer<typeof userSettingsSchema>) {
    await updateUserProfile({ ...values, csrfToken });
  }

  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Set the name your team sees on assigned client files.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" disabled value={user.email ?? ""} />
              </FormControl>
              <FormDescription>This is the email your agency uses for access.</FormDescription>
              <FormMessage />
            </FormItem>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending} aria-busy={isPending}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
