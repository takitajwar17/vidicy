import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

interface AgencyPageShellProps {
  breadcrumbs: { href: string; label: string }[];
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AgencyPageShell({
  breadcrumbs,
  title,
  description,
  actions,
  children,
  className,
}: AgencyPageShellProps) {
  return (
    <>
      <PageHeader items={breadcrumbs} />
      <main className={cn("mx-auto flex w-full max-w-[1520px] flex-1 flex-col gap-5 px-4 py-5 md:px-6 md:py-6", className)}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
            {description ? (
              <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </main>
    </>
  );
}
