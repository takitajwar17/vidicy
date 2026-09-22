"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BlurFade from "@/components/magicui/blur-fade";
import { MapPinOffIcon, HomeIcon, LayoutDashboardIcon } from "lucide-react";

const _ease = [0.16, 1, 0.3, 1];

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Icon */}
      <BlurFade delay={0.05} yOffset={0}>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: _ease }}
          className="mb-8 flex items-center justify-center"
        >
          <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20">
            <motion.div
              className="absolute inset-0 rounded-3xl bg-primary/5"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <MapPinOffIcon className="h-12 w-12 text-primary" strokeWidth={1.5} />
          </div>
        </motion.div>
      </BlurFade>

      {/* Heading */}
      <BlurFade delay={0.15} yOffset={16}>
        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          We couldn&apos;t find that page
        </h1>
      </BlurFade>

      {/* Subtext */}
      <BlurFade delay={0.25} yOffset={16}>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for may have been moved or no longer
          exists. Double-check the URL or head somewhere safe.
        </p>
      </BlurFade>

      {/* Actions */}
      <BlurFade delay={0.35} yOffset={16}>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2")}
          >
            <HomeIcon className="h-4 w-4" />
            Go to Homepage
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
          >
            <LayoutDashboardIcon className="h-4 w-4" />
            Go to dashboard
          </Link>
        </div>
      </BlurFade>

      <BlurFade delay={0.45} yOffset={8}>
        <p className="mt-10 text-sm text-muted-foreground">
          Still lost?{" "}
          <Link href="/dashboard/support" className="text-primary underline-offset-4 hover:underline">
            Contact support
          </Link>
        </p>
      </BlurFade>
    </div>
  );
}
