"use client";

import { Button } from "@/components/ui/button";
import { AuthShell } from "../_components/auth-shell";
import { useRouter } from "next/navigation";
import { resetPasswordAction } from "./reset-password.action";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { resetPasswordSchema } from "@/schemas/reset-password.schema";
import type { ResetPasswordSchema } from "@/schemas/reset-password.schema";
import { useCsrfToken } from "@/components/csrf-provider";

export default function ResetPasswordClientComponent({ token }: { token: string }) {
  const router = useRouter();
  const csrfToken = useCsrfToken();

  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token,
      password: "",
      confirmPassword: "",
    },
  });

  const {
    execute: resetPassword,
    isSuccess,
    isPending,
  } = useServerAction(resetPasswordAction, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message);
    },
    onStart: () => {
      toast.loading("Resetting password...");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Password reset successfully");
    },
  });

  const onSubmit = async (data: ResetPasswordSchema) => {
    resetPassword({ ...data, csrfToken });
  };

  if (isSuccess) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Password Reset Successfully</h1>
            <p className="text-sm text-muted-foreground">
              Your password has been reset. You can now log in with your new password.
            </p>
          </div>
          <div>
            <Button variant="outline" className="w-full" onClick={() => router.push("/sign-in")}>
              Go to Login
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Reset Password</h1>
          <p className="text-sm text-muted-foreground">Enter your new password below.</p>
        </div>
        <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isPending} aria-busy={isPending}>
                {isPending ? "Resetting password…" : "Reset password"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </AuthShell>
  );
}
