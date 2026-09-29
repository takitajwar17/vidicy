"use client";

import type React from "react";
import Logo from "@/components/logo";
import { FloatingPaths } from "@/components/floating-paths";
import Link from "next/link";
import type { Route } from "next";

interface AuthShellProps {
  children: React.ReactNode;
  /** Testimonial quote shown in the left panel */
  testimonial?: {
    quote: string;
    author: string;
  };
}

/**
 * Split-screen auth layout inspired by efferd/auth-5.
 *
 * Left panel  — brand + animated paths + testimonial (hidden on mobile)
 * Right panel — scrollable form area
 */
export function AuthShell({
  children,
  testimonial = {
    quote:
      "We moved first-pass reviews from hours to minutes and sent clients clear fixes the same day.",
    author: "Operations Lead, Visa & Travel Agency",
  },
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen w-full">
      {/* ── Left panel: brand + testimonial ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        <FloatingPaths position={1} className="w-full h-full text-sidebar-foreground" />
        <FloatingPaths position={-1} className="w-full h-full text-sidebar-foreground" />

        {/* Logo */}
        <div className="relative z-10">
          <Link href={"/" as Route} aria-label="Home">
            <Logo className="h-8 w-auto" surface="dark" />
          </Link>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 mt-auto">
          <blockquote className="space-y-3">
            <p className="text-lg font-medium leading-relaxed text-sidebar-foreground">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <footer className="text-sm text-sidebar-foreground/60">
              ~ {testimonial.author}
            </footer>
          </blockquote>
        </div>

        {/* Decorative gradient overlays */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sidebar/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-sidebar/80 to-transparent" />
      </div>

      {/* ── Right panel: form area ── */}
      <div className="flex w-full flex-col lg:w-1/2">
        {/* Mobile-only top bar with Home link */}
        <div className="flex items-center justify-between p-4 lg:hidden">
          <Link href={"/" as Route} aria-label="Home">
            <Logo className="h-7 w-auto" />
          </Link>
          <Link
            href={"/" as Route}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Home
          </Link>
        </div>

        {/* Desktop top-right Home link */}
        <div className="hidden items-center justify-end p-6 lg:flex">
          <Link
            href={"/" as Route}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Home
          </Link>
        </div>

        {/* Centered form content */}
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
