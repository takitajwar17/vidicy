"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BlurFade from "@/components/magicui/blur-fade";
import { LockKeyholeIcon, AlertTriangleIcon, LayoutDashboardIcon, HomeIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";

const _ease = [0.16, 1, 0.3, 1];

interface ErrorPageProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  iconRing: string;
  glowColor: string;
  heading: string;
  body: string;
  onRetry?: () => void;
}

export function ErrorPage({
  icon: Icon,
  iconColor,
  iconBg,
  iconRing,
  glowColor,
  heading,
  body,
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div className={cn("pointer-events-none absolute inset-0 flex items-center justify-center")}>
        <div className={cn("h-[400px] w-[400px] rounded-full blur-[120px]", glowColor)} />
      </div>

      <BlurFade delay={0.05} yOffset={0}>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: _ease }}
          className="mb-8 flex items-center justify-center"
        >
          <div className={cn("relative flex h-28 w-28 items-center justify-center rounded-3xl", iconBg, iconRing)}>
            <motion.div
              className={cn("absolute inset-0 rounded-3xl", iconBg)}
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <Icon className={cn("h-12 w-12", iconColor)} strokeWidth={1.5} />
          </div>
        </motion.div>
      </BlurFade>

      <BlurFade delay={0.15} yOffset={16}>
        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {heading}
        </h1>
      </BlurFade>

      <BlurFade delay={0.25} yOffset={16}>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </BlurFade>

      <BlurFade delay={0.35} yOffset={16}>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2")}
          >
            <LayoutDashboardIcon className="h-4 w-4" />
            My Applications
          </Link>
          {onRetry && (
            <button
              onClick={onRetry}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
            >
              <RefreshCwIcon className="h-4 w-4" />
              Try Again
            </button>
          )}
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "gap-2")}
          >
            <HomeIcon className="h-4 w-4" />
            Home
          </Link>
        </div>
      </BlurFade>

      <BlurFade delay={0.45} yOffset={8}>
        <p className="mt-10 text-sm text-muted-foreground">
          Need help?{" "}
          <Link
            href="/dashboard/support"
            className="text-primary underline-offset-4 hover:underline"
          >
            Contact support
          </Link>
        </p>
      </BlurFade>
    </div>
  );
}

export { LockKeyholeIcon, AlertTriangleIcon };
