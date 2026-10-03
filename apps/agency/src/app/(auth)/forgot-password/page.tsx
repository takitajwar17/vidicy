import { Metadata } from "next";
import ForgotPasswordClientComponent from "./forgot-password.client";
import { getConfig } from "@/flags";
import { getSessionFromCookie } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your password",
};

export default async function ForgotPasswordPage() {
  const [config, session] = await Promise.all([getConfig(), getSessionFromCookie()]);

  return (
    <ForgotPasswordClientComponent
      email={session?.user.email ?? ""}
      isTurnstileEnabled={config.isTurnstileEnabled}
    />
  );
}
