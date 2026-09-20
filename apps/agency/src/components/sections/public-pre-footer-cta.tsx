import Link from "next/link";
import type { Route } from "next";

import { PUBLIC_SIGN_UP_CTA_LABEL } from "@/constants";
import { Button } from "@/components/ui/button";

export default function PublicPreFooterCta() {
  return (
    <section className="relative mx-auto mt-16 w-full max-w-7xl px-5 sm:px-8 lg:px-12">
      <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-background/75 px-5 py-9 text-foreground shadow-[0_24px_80px_-36px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:rounded-[2.5rem] sm:px-8 sm:py-12 md:px-12 md:py-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <h2 className="font-display text-[2.4rem] leading-[0.95] tracking-tight text-foreground [font-family:var(--font-display)] sm:text-4xl md:text-6xl">
            Start Your Free Evaluation Before You Submit
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-foreground/72 sm:text-base md:text-lg">
            Get the route-specific checklist, upload your documents, and see what still needs work
            before you decide whether to unlock deeper review support.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <Button
              asChild
              className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              <Link href={"/sign-up" as Route}>{PUBLIC_SIGN_UP_CTA_LABEL}</Link>
            </Button>
            <Link
              href="/#pricing"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/75 bg-background/52 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-background/72 sm:w-auto"
            >
              Compare Plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
