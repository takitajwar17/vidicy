import type { CSSProperties, ReactNode } from "react";

import Footer from "@/components/sections/footer";
import Header from "@/components/sections/header";
import PublicPreFooterCta from "@/components/sections/public-pre-footer-cta";
import { cn } from "@/lib/utils";

const publicSiteTheme: CSSProperties = {
  "--background": "218 38% 98%",
  "--foreground": "223 34% 14%",
  "--primary": "216 78% 45%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "214 54% 94%",
  "--secondary-foreground": "223 43% 28%",
  "--muted": "218 28% 95%",
  "--muted-foreground": "223 14% 40%",
  "--accent": "207 89% 55%",
  "--accent-foreground": "0 0% 100%",
  "--border": "217 28% 86%",
  "--ring": "215 87% 54%",
  "--radius": "1rem",
  "--font-display": "'Instrument Serif', serif",
  "--font-body": "var(--font-sans)",
  "--shadow-dashboard":
    "0 24px 70px -28px hsl(223 44% 18% / 0.28), 0 0 0 1px hsl(219 20% 85% / 0.85)",
  "--status-warning": "42 89% 55%",
  "--status-success": "214 78% 52%",
} as CSSProperties;

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-public-site-shell
      style={publicSiteTheme}
      className="relative isolate w-full overflow-x-hidden text-foreground [font-family:var(--font-body)]"
    >
      <Header />
      <main id="main-content">{children}</main>
      <PublicPreFooterCta />
      <Footer />
    </div>
  );
}

export function PublicPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-screen bg-background pt-16 sm:pt-20", className)}>
      {children}
    </div>
  );
}

export function PublicPageHero({
  eyebrow,
  title,
  description,
  meta,
  actions,
  align = "left",
  maxWidthClassName = "max-w-4xl",
  titleClassName,
  descriptionClassName,
  metaClassName,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  align?: "left" | "center";
  maxWidthClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  metaClassName?: string;
  className?: string;
}) {
  const isCentered = align === "center";

  return (
    <section
      data-public-page-hero
      className="relative overflow-hidden border-b bg-gradient-to-b from-background via-muted/40 to-background"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,hsl(var(--primary)/0.15),transparent_36%),radial-gradient(circle_at_88%_0%,hsl(var(--accent)/0.12),transparent_28%)]" />
      <div
        className={cn(
          "relative mx-auto px-4 py-16 sm:py-24",
          maxWidthClassName,
          isCentered && "text-center",
          className,
        )}
      >
        <div
          className={cn(
            "mb-3 flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-[0.22em] text-primary",
            isCentered ? "justify-center" : "justify-start",
          )}
        >
          {eyebrow}
        </div>
        <h1
          className={cn(
            "max-w-3xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-5xl",
            isCentered && "mx-auto",
            titleClassName,
          )}
        >
          {title}
        </h1>
        {meta ? (
          <p
            className={cn(
              "mt-4 text-base text-muted-foreground",
              isCentered && "mx-auto",
              metaClassName,
            )}
          >
            {meta}
          </p>
        ) : null}
        {description ? (
          <p
            className={cn(
              "mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg",
              isCentered && "mx-auto",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
        {actions ? (
          <div
            className={cn(
              "mt-8 flex flex-col gap-3 sm:flex-row",
              isCentered ? "justify-center" : "justify-start",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PublicPageContent({
  children,
  className,
  maxWidthClassName = "max-w-4xl",
}: {
  children: ReactNode;
  className?: string;
  maxWidthClassName?: string;
}) {
  return (
    <div
      data-public-page-content
      className={cn("mx-auto px-4 py-12 sm:py-16", maxWidthClassName, className)}
    >
      {children}
    </div>
  );
}
