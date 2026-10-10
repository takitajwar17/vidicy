"use client";

import { Button } from "@/components/ui/button";
import { AuthShell } from "../_components/auth-shell";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { forgotPasswordAction } from "./forgot-password.action";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { z } from "zod";
import { Captcha } from "@/components/captcha";
import { forgotPasswordSchema } from "@/schemas/forgot-password.schema";
import { useEffect } from "react";
import { useCsrfToken } from "@/components/csrf-provider";

type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordClientProps {
  email: string;
  isTurnstileEnabled: boolean;
}

export default function ForgotPasswordClientComponent({
  email,
  isTurnstileEnabled,
}: ForgotPasswordClientProps) {
  const router = useRouter();
  const csrfToken = useCsrfToken();

  const form = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  useEffect(() => {
    if (email) {
      form.setValue("email", email);
    }
  }, [email, form]);

  const captchaToken = useWatch({ control: form.control, name: "captchaToken" });

  const {
    execute: sendResetLink,
    isSuccess,
    isPending,
  } = useServerAction(forgotPasswordAction, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message);
    },
    onStart: () => {
      toast.loading("Sending reset instructions...");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Reset instructions sent");
    },
  });

  const onSubmit = async (data: ForgotPasswordSchema) => {
    sendResetLink({
      ...data,
      email: data.email ?? email,
      csrfToken,
    });
  };

  if (isSuccess) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists with that email, we&apos;ve sent you instructions to reset your
              password.
            </p>
          </div>
          <div>
            <Button variant="outline" className="w-full" onClick={() => router.push("/sign-in")}>
              Back to login
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {email ? "Change password" : "Forgot password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email address and we&apos;ll send you instructions to reset your password.
          </p>
        </div>
        <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                disabled={Boolean(email)}
                defaultValue={email || undefined}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        className="w-full px-3 py-2"
                        placeholder="name@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col justify-center items-center">
                <Captcha
                  enabled={isTurnstileEnabled}
                  onSuccess={(token: string) => form.setValue("captchaToken", token)}
                  validationError={form.formState.errors.captchaToken?.message}
                />

                <Button
                  type="submit"
                  className="mt-8 mb-2"
                  disabled={isPending || Boolean(isTurnstileEnabled && !captchaToken)}
                  aria-busy={isPending}
                >
                  {isPending ? "Sending instructions…" : "Send reset instructions"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>

      <div className="mt-4 w-full">
        {email ? (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => router.push("/settings")}
          >
            Back to settings
          </Button>
        ) : (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => router.push("/sign-in")}
          >
            Back to login
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
