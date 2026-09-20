import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const pageTheme = {
  "--background": "218 38% 98%",
  "--foreground": "223 34% 14%",
  "--primary": "223 55% 31%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "220 46% 93%",
  "--secondary-foreground": "223 43% 30%",
  "--muted": "218 28% 95%",
  "--muted-foreground": "223 14% 40%",
  "--accent": "211 82% 58%",
  "--accent-foreground": "0 0% 100%",
  "--border": "219 24% 87%",
  "--ring": "212 85% 56%",
  "--radius": "1.25rem",
  "--shadow-dashboard":
    "0 24px 70px -28px hsl(223 44% 18% / 0.28), 0 0 0 1px hsl(219 20% 85% / 0.85)",
  "--status-warning": "42 89% 55%",
  "--status-success": "214 78% 52%",
} as CSSProperties;

export const innerOutlineCardTheme = {
  "--background": "0 0% 100%",
  "--secondary": "0 0% 99.3%",
  "--muted": "0 0% 99.0%",
  "--border": "240 18% 90%",
  backgroundColor: "rgba(255, 255, 255, 0.97)",
} as CSSProperties;

export function SectionShell({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative px-4 py-14 sm:px-6 sm:py-16 md:px-10 md:py-20 lg:px-16 xl:px-20",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center md:max-w-3xl">
      <h2 className="font-display text-[2.35rem] leading-[0.96] tracking-tight text-foreground [font-family:var(--font-display)] sm:text-[2.85rem] md:text-5xl lg:text-[3.5rem]">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-6 text-foreground/78 sm:text-base sm:leading-7 md:text-lg">
        {subtitle}
      </p>
    </div>
  );
}

export function SectionSurface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[2rem] p-2.5 sm:rounded-[2.35rem] sm:p-3 md:rounded-[2.75rem] md:p-4"
      style={{
        background: "rgba(255, 255, 255, 0.90)",
        border: "1px solid rgba(255, 255, 255, 0.95)",
        boxShadow: "var(--shadow-dashboard)",
      }}
    >
      <div
        className={cn(
          "rounded-[1.6rem] border border-border/80 bg-background px-4 py-6 sm:rounded-[1.85rem] sm:px-6 sm:py-7 md:rounded-[2.15rem] md:px-10 md:py-10",
          className,
        )}
        style={innerOutlineCardTheme}
      >
        {children}
      </div>
    </div>
  );
}
