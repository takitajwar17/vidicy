"use client";

import { signUpAction } from "./sign-up.action";
import { type SignUpSchema, signUpSchema } from "@/schemas/signup.schema";
import type { Route } from "next";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthDivider } from "@/components/auth-divider";
import { AuthShell } from "../_components/auth-shell";
import { Spinner } from "@/components/ui/spinner";
import { Captcha } from "@/components/captcha";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useServerAction } from "zsa-react";
import Link from "next/link";
import SSOButtons from "../_components/sso-buttons";
import { useState } from "react";
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { REDIRECT_AFTER_SIGN_IN } from "@/constants";
import { useCsrfToken } from "@/components/csrf-provider";
import { getAuthRouteHref, getPostAuthRedirectPath } from "@/utils/auth-redirect";
import {
  type EmailSignupStep,
} from "./progressive-signup";

interface SignUpClientProps {
  email: string;
  redirectPath: string;
  isGoogleSSOEnabled: boolean;
  isTurnstileEnabled: boolean;
}

const SignUpPage = ({
  email,
  redirectPath,
  isGoogleSSOEnabled,
  isTurnstileEnabled,
}: SignUpClientProps) => {
  const csrfToken = useCsrfToken();
  const [emailSignupStep, setEmailSignupStep] = useState<EmailSignupStep>(
    email ? "details" : "choice",
  );
  const [showPassword, setShowPassword] = useState(false);

  const { execute: signUp, isPending: isSigningUp } = useServerAction(signUpAction, {
    onError: (error) => {
      toast.dismiss();
      const msg = error.err?.message;
      if (msg === "Email already taken") {
        const email = form.getValues("email");
        toast.error("Email already taken", {
          description: "Try signing in or resetting your password.",
          action: {
            label: "Sign in",
            onClick: () => {
              window.location.href = `/sign-in?email=${encodeURIComponent(email)}`;
            },
          },
        });
      } else {
        toast.error(msg);
      }
    },
    onStart: () => {
      toast.loading("Creating your account...");
    },
    onSuccess: (response) => {
      toast.dismiss();
      toast.success("Account created successfully");
      window.location.href =
        response?.data?.redirectTo ??
        getPostAuthRedirectPath({
          isEmailVerified: false,
          verifiedRedirectPath: redirectPath || REDIRECT_AFTER_SIGN_IN,
        });
    },
  });

  const form = useForm<SignUpSchema & { fullName: string }>({
    resolver: zodResolver(
      signUpSchema
        .omit({ firstName: true, lastName: true })
        .extend({ fullName: signUpSchema.shape.firstName }),
    ),
    defaultValues: {
      email,
      fullName: "",
      password: "",
      captchaToken: "",
      agreeToTerms: undefined as unknown as true,
    },
  });

  const captchaToken = useWatch({ control: form.control, name: "captchaToken" });

  const onSubmit = async (data: SignUpSchema & { fullName: string }) => {
    const names = data.fullName.trim().split(/\s+/);
    const firstName = names[0] || "";
    const lastName = names.slice(1).join(" ") || firstName;
    signUp({ ...data, firstName, lastName, csrfToken, verifiedRedirectPath: redirectPath });
  };

  const stepCopy: Record<
    EmailSignupStep,
    { title: string; description: string }
  > = {
    choice: {
      title: "Create your agency account",
      description: "Join the review desk your agency uses for passports, forms, and client fixes.",
    },
    email: {
      title: "Create your account",
      description: "Add the name your team should see beside assigned client files.",
    },
    details: {
      title: "Create your account",
      description: "Add the name your team should see beside assigned client files.",
    },
  };

  const handleStartEmailSignup = () => {
    setEmailSignupStep("details");
  };

  const handleBack = () => {
    setEmailSignupStep("choice");
  };

  return (
    <AuthShell
      testimonial={{
        quote:
          "Our reviewers turned the morning file backlog into exact client fixes before lunch.",
        author: "Agency Operations Manager",
      }}
    >
      <div className="space-y-2.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
          {stepCopy[emailSignupStep].title}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground/90">
          {stepCopy[emailSignupStep].description}
        </p>
      </div>

      {/* Main form — wraps all steps */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {emailSignupStep === "choice" && (
            <div className="space-y-4">
              <SSOButtons redirectPath={redirectPath} isGoogleSSOEnabled={isGoogleSSOEnabled} />

              <AuthDivider>or</AuthDivider>

              <Button
                type="button"
                className="h-11 w-full"
                size="lg"
                onClick={handleStartEmailSignup}
              >
                Continue with email
              </Button>
            </div>
          )}

          {emailSignupStep === "details" && (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium tracking-[0.01em] text-foreground/90">Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="e.g. john@example.com"
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
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-medium tracking-[0.01em] text-foreground/90">Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. John Doe"
                        autoComplete="name"
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
                    <FormLabel className="text-[13px] font-medium tracking-[0.01em] text-foreground/90">Create Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Minimum 8 characters"
                          autoComplete="new-password"
                          className="h-11 pr-10 text-[15px]"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOffIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <p className="text-xs font-medium tracking-[0.01em] text-muted-foreground/85">Must be at least 8 characters</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col justify-center items-center">
                <FormField
                  control={form.control}
                  name="agreeToTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 w-full mb-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true ? true : undefined)
                          }
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer text-xs font-medium leading-relaxed tracking-[0.01em] text-muted-foreground/90">
                          I agree to the{" "}
                          <Link
                            href="/terms"
                            target="_blank"
                            className="font-semibold text-primary hover:text-primary/90 underline"
                          >
                            Terms of Service
                          </Link>{" "}
                          and{" "}
                          <Link
                            href="/privacy"
                            target="_blank"
                            className="font-semibold text-primary hover:text-primary/90 underline"
                          >
                            Privacy Policy
                          </Link>
                          .
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="captchaToken"
                  render={() => (
                    <FormItem className="flex flex-col items-center">
                      <FormControl>
                        <Captcha
                          enabled={isTurnstileEnabled}
                          onSuccess={(token: string) => form.setValue("captchaToken", token)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4 flex w-full gap-3">
                  <Button type="button" variant="outline" className="h-11 flex-1 text-sm font-semibold tracking-[0.01em]" onClick={handleBack}>
                    <ChevronLeftIcon className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 text-sm"
                    size="lg"
                    disabled={isSigningUp || Boolean(isTurnstileEnabled && !captchaToken)}
                  >
                    {isSigningUp ? (
                      <>
                        <Spinner className="mr-2 h-5 w-5" />
                        Creating account…
                      </>
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </Form>

      <p className="text-sm text-center text-muted-foreground/90">
        Already have an account?{" "}
        <Link
          href={getAuthRouteHref("/sign-in", redirectPath) as Route}
          className="font-semibold text-primary hover:text-primary/90 underline"
        >
          Sign in
        </Link>
      </p>

    </AuthShell>
  );
};

export default SignUpPage;
