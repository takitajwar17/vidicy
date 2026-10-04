"use client";

import { signInAction } from "./sign-in.action";
import { type SignInSchema, signInSchema } from "@/schemas/signin.schema";
import { useState } from "react";
import type { Route } from "next";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthDivider } from "@/components/auth-divider";
import { AuthShell } from "../_components/auth-shell";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useServerAction } from "zsa-react";
import Link from "next/link";
import SSOButtons from "../_components/sso-buttons";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useCsrfToken } from "@/components/csrf-provider";
import { getAuthRouteHref } from "@/utils/auth-redirect";

interface SignInClientProps {
  email: string;
  redirectPath: string;
  isGoogleSSOEnabled: boolean;
}

const SignInPage = ({ email, redirectPath, isGoogleSSOEnabled }: SignInClientProps) => {
  const csrfToken = useCsrfToken();
  const [showPassword, setShowPassword] = useState(false);
  const { execute: signIn, isPending: isSigningIn } = useServerAction(signInAction, {
    onError: (error) => {
      toast.dismiss()
      toast.error(error.err?.message)
    },
    onStart: () => {
      toast.loading("Signing you in...")
    },
    onSuccess: (response) => {
      toast.dismiss()
      toast.success("Signed in successfully")
      window.location.href = response?.data?.redirectTo ?? redirectPath;
    }
  })
  const form = useForm<SignInSchema>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email },
  });

  const onSubmit = async (data: SignInSchema) => {
    signIn({ ...data, csrfToken, verifiedRedirectPath: redirectPath })
  }

  return (
    <AuthShell
      testimonial={{
        quote:
          "The morning pile of passports, forms, and bank statements became a same-day fix list for clients.",
        author: "Operations Lead, Visa & Travel Agency",
      }}
    >
      <div className="space-y-2.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
          Sign in to Vidicy
        </h1>
        <p className="text-sm leading-6 text-muted-foreground/90">
          Open the review desk your agency uses for client files.
        </p>
      </div>

      <div className="space-y-3">
        <SSOButtons isSignIn redirectPath={redirectPath} isGoogleSSOEnabled={isGoogleSSOEnabled} />
      </div>

      <AuthDivider>or</AuthDivider>

      {/* Email / password form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground/90">
            Enter the email your agency added to the review desk.
          </p>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] font-medium tracking-[0.01em] text-foreground/90">Email address</FormLabel>
                <FormControl>
                  <Input
                    placeholder="you@example.com"
                    type="email"
                    autoFocus
                    autoComplete="email"
                    className="h-11 text-[15px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] font-medium tracking-[0.01em] text-foreground/90">Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      autoComplete="current-password"
                      className="h-11 pr-10 text-[15px]"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-semibold tracking-[0.01em] text-primary hover:text-primary/90">
                    Forgot password?
                  </Link>
                </div>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="h-11 w-full text-sm"
            size="lg"
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <>
                <Spinner className="mr-2 h-5 w-5" />
                Signing in…
              </>
            ) : (
              "Continue with email"
            )}
          </Button>
        </form>
      </Form>

      <p className="text-sm text-center text-muted-foreground/90">
        Don&#39;t have an account?{" "}
        <Link
          href={getAuthRouteHref("/sign-up", redirectPath) as Route}
          className="font-semibold text-primary hover:text-primary/90 underline"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
};

export default SignInPage;
