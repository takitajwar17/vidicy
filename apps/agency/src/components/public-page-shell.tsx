import type { ReactNode } from "react";

import Footer from "@/components/sections/footer";
import Header from "@/components/sections/header";
import { cn } from "@/lib/utils";

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-public-site-shell
      className="public-site-font-system relative isolate w-full overflow-x-hidden text-foreground"
    >
      <Header />
      <main id="main-content">{children}</main>
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
      className="dark relative overflow-hidden border-b border-border bg-background text-foreground"
    >
      <div
        className={cn(
          "relative mx-auto px-4 py-14 sm:py-20",
          maxWidthClassName,
          isCentered && "text-center",
          className,
        )}
      >
        <div
          className={cn(
            "mb-4 flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-foreground/55",
            isCentered ? "justify-center" : "justify-start",
          )}
        >
          {eyebrow}
        </div>
        <h1
          className={cn(
            "max-w-3xl font-display text-4xl font-normal leading-[0.98] tracking-[-0.07em] text-foreground sm:text-6xl",
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
              "mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg",
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
