import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CASE_PRIORITY_META,
  CASE_STATUS_META,
  ISSUE_SEVERITY_META,
  getRiskBadgeClass,
  getStatusBadgeClass,
} from "@/lib/agency-workflow";

export function formatShortDate(date: Date | null | undefined) {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-2xs font-bold", getStatusBadgeClass(status))}>
      {CASE_STATUS_META[status as keyof typeof CASE_STATUS_META]?.label ?? status.replaceAll("_", " ")}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn("text-xs font-bold", CASE_PRIORITY_META[priority as keyof typeof CASE_PRIORITY_META]?.className)}>
      {CASE_PRIORITY_META[priority as keyof typeof CASE_PRIORITY_META]?.label ?? priority}
    </span>
  );
}

export function RiskBadge({ riskLevel }: { riskLevel?: string | null }) {
  return (
    <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-2xs font-bold capitalize", getRiskBadgeClass(riskLevel))}>
      {riskLevel ?? "Unscored"}
    </Badge>
  );
}

export function IssueSeverityBadge({ severity }: { severity: string }) {
  const meta = ISSUE_SEVERITY_META[severity as keyof typeof ISSUE_SEVERITY_META];
  return (
    <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 text-2xs font-bold", meta?.badgeClassName)}>
      {meta?.label ?? severity}
    </Badge>
  );
}

export function ReviewerAvatar({
  name,
  email,
  avatar,
  className,
}: {
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  className?: string;
}) {
  const displayName = name || email || "Unassigned";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "UA";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-foreground">
          {initials}
        </span>
      )}
      <span className="min-w-0 truncate text-sm font-medium">{displayName}</span>
    </span>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-status-success/12 text-status-success",
    warning: "bg-status-warning/12 text-status-warning",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-status-info/12 text-status-info",
  }[tone];

  return (
    <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneClass)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
          <span className="block text-2xl font-bold tracking-tight">{value}</span>
          {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
        </span>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {href && actionLabel ? (
        <Link
          href={href as Route}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-button-primary)] hover:bg-primary-hover"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
