"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { innerOutlineCardTheme } from "@/components/homepage/section-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const appPreviewStroke = "rgba(28, 63, 76, 0.78)";
const appPreviewSoftStroke = "rgba(28, 63, 76, 0.36)";
const LANDING_POPUP_DISMISSED_AT_KEY = "vidicy:landing-popup:dismissed-at";
const LANDING_POPUP_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const LANDING_POPUP_DELAY_MS = 30_000; // 30 seconds
const LANDING_POPUP_SCROLL_TRIGGER = 0.4; // 40% scroll depth

const sidebarItems = [
  { label: "Overview", active: true },
  { label: "Checklist" },
  { label: "Documents", badge: "12" },
  { label: "Evaluation" },
  { label: "Atlas", chevron: true },
  { label: "Applicants" },
  { label: "Settings", chevron: true },
] as const;

const actionItems: readonly { label: string; accent?: boolean }[] = [
  { label: "Upload Documents", accent: true },
  { label: "Generate Checklist" },
  { label: "Review Risks" },
  { label: "Ask Atlas" },
  { label: "Add Applicant" },
  { label: "Start Evaluation" },
] as const;

const checklistRows = [
  ["Passport bio page", "Required"],
  ["Employment letter", "Required"],
  ["Bank statements", "Required"],
  ["Travel itinerary", "Recommended"],
] as const;

const flaggedIssues = [
  { item: "Employment letter", detail: "Missing salary detail", severity: "High", status: "Open" },
  { item: "Bank statements", detail: "Trip cost unclear", severity: "Medium", status: "Review" },
  { item: "Passport scan", detail: "Low contrast image", severity: "Low", status: "Fix" },
  { item: "Cover letter", detail: "Explain travel purpose", severity: "Medium", status: "Draft" },
] as const;

function isLandingPopupCooldownActive() {
  try {
    const storedValue = window.localStorage.getItem(LANDING_POPUP_DISMISSED_AT_KEY);
    if (!storedValue) {
      return false;
    }

    const dismissedAt = Number(storedValue);
    if (!Number.isFinite(dismissedAt)) {
      return false;
    }

    return Date.now() - dismissedAt < LANDING_POPUP_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markLandingPopupDismissed() {
  try {
    window.localStorage.setItem(LANDING_POPUP_DISMISSED_AT_KEY, Date.now().toString());
  } catch {
    // Best-effort only; continue even when storage is unavailable.
  }
}

export function LandingSignupPopup() {
  const [open, setOpen] = useState(false);
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (isLandingPopupCooldownActive()) {
      return;
    }

    const canUseExitIntent = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let timeoutId = 0;

    function showPopup() {
      if (hasShownRef.current) {
        return;
      }

      hasShownRef.current = true;
      setOpen(true);
      window.clearTimeout(timeoutId);
      window.removeEventListener("scroll", onScroll);
      if (canUseExitIntent) {
        document.removeEventListener("mouseout", onMouseOut);
      }
    }

    function onScroll() {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) {
        return;
      }

      const scrollProgress = window.scrollY / scrollableHeight;
      if (scrollProgress >= LANDING_POPUP_SCROLL_TRIGGER) {
        showPopup();
      }
    }

    function onMouseOut(event: MouseEvent) {
      if (event.relatedTarget) {
        return;
      }

      if (event.clientY <= 0) {
        showPopup();
      }
    }

    timeoutId = window.setTimeout(showPopup, LANDING_POPUP_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (canUseExitIntent) {
      document.addEventListener("mouseout", onMouseOut);
    }

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("scroll", onScroll);
      if (canUseExitIntent) {
        document.removeEventListener("mouseout", onMouseOut);
      }
    };
  }, []);

  function closeWithCooldown() {
    markLandingPopupDismissed();
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && open) {
      markLandingPopupDismissed();
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[92vw] max-w-[560px] overflow-hidden rounded-2xl border-border/75 p-0">
        <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.98))] p-6 sm:p-7">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[1.95rem] leading-[0.95] tracking-tight [font-family:var(--font-display)]">
              Start Free: Case-Specific Checklist + First Document Review
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-foreground/72">
              Instead of generic advice, get a checklist built for your case, run your first
              document review for free, and keep improving with unlimited document reviews that show
              exactly what to fix each time.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-5 flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
            <Button variant="ghost" className="w-full sm:w-auto" onClick={closeWithCooldown}>
              Maybe later
            </Button>
            <Button
              asChild
              className="w-full rounded-full border border-black/80 border-b-black/95 border-t-white/25 !bg-[linear-gradient(180deg,#1a1a1a_0%,#070707_52%,#000000_100%)] !text-[#FFFFFF] transition-[transform,background-image,border-color] duration-200 hover:!bg-[linear-gradient(180deg,#202020_0%,#0d0d0d_52%,#040404_100%)] hover:border-t-white/35 active:translate-y-[2px] sm:w-auto"
            >
              <Link href={"/sign-up" as Route} onClick={closeWithCooldown}>
                Get My Free Review
              </Link>
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FadeUp({
  children,
  className,
  delay = 0,
  duration = 0.8,
  y,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
}) {
  return (
    <div
      className={cn("animate-fade-rise motion-reduce:animate-none", className)}
      style={
        {
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          "--fade-up-y": y ? `${y}px` : "24px",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function DashboardSidebarItem({
  label,
  active = false,
  badge,
  chevron = false,
}: {
  label: string;
  active?: boolean;
  badge?: string;
  chevron?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-[1rem] px-3.5 py-2.5 text-[11px] font-medium tracking-tight sm:text-[12px] lg:rounded-full",
        active ? "border bg-background text-foreground shadow-sm" : "text-foreground/86",
      )}
      style={active ? { borderColor: appPreviewStroke } : undefined}
    >
      <span>{label}</span>
      {badge ? (
        <span className="ml-3 text-[12px] font-semibold text-foreground/82">{badge}</span>
      ) : null}
      {chevron ? <ChevronRight className="h-4 w-4 text-foreground/72" /> : null}
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const className =
    severity === "High"
      ? "bg-destructive/12 text-destructive"
      : severity === "Medium"
        ? "bg-status-warning/12 text-status-warning"
        : "bg-status-success/12 text-status-success";

  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", className)}>
      {severity}
    </span>
  );
}

export function ReviewPreview() {
  return (
    <FadeUp delay={0.5} duration={0.8} y={30} className="mt-8 w-full max-w-5xl sm:mt-10 md:mt-12">
      <div
        className="overflow-hidden rounded-[1.9rem] p-2.5 sm:rounded-[2.15rem] sm:p-3 md:rounded-[2.35rem]"
        style={{
          background: "rgba(228, 233, 242, 0.86)",
          border: `1.5px solid ${appPreviewSoftStroke}`,
          boxShadow: "var(--shadow-dashboard)",
        }}
      >
        <div
          className="pointer-events-none select-none overflow-hidden rounded-[1.55rem] border bg-background text-[10px] text-foreground sm:rounded-[1.75rem] sm:text-[11px] md:rounded-[1.95rem]"
          style={{
            ...innerOutlineCardTheme,
            borderColor: appPreviewStroke,
            backgroundColor: "rgba(255, 255, 255, 0.985)",
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-4 sm:py-4 md:px-6"
            style={{ borderColor: appPreviewStroke }}
          >
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="pl-1 text-[1.45rem] leading-none font-semibold tracking-tight text-foreground sm:text-[1.8rem]">
                V
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium sm:text-[12px]">
                <span>Vidicy</span>
                <ChevronDown className="h-3.5 w-3.5 text-foreground/48" />
              </div>
            </div>

            <div className="order-3 w-full md:order-none md:flex md:min-w-[260px] md:flex-1 md:items-center md:justify-center">
              <div
                className="flex w-full items-center justify-between rounded-full border bg-background px-3 py-2 text-foreground/84 sm:px-4 sm:py-2.5 md:max-w-[390px]"
                style={{ borderColor: appPreviewStroke }}
              >
                <div className="flex items-center gap-2.5 text-[12px]">
                  <Search className="h-3.5 w-3.5" />
                  <span>Search applicants</span>
                </div>
                <span
                  className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-foreground/70"
                  style={{ borderColor: appPreviewSoftStroke }}
                >
                  ⌘K
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
              <span className="hidden text-[11px] font-medium text-foreground/88 sm:block sm:text-[12px]">
                New Review
              </span>
              <div
                className="rounded-full border bg-background p-2 text-foreground/70"
                style={{ borderColor: appPreviewStroke }}
              >
                <Bell className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-semibold text-foreground/90">JP</span>
            </div>
          </div>

          <div className="grid gap-3 bg-background p-3 sm:gap-4 sm:p-4 lg:min-h-[470px] lg:grid-cols-[190px_minmax(0,1fr)] lg:p-0">
            <aside
              className="order-2 rounded-[1.4rem] border bg-background px-3 py-4 sm:px-4 lg:order-1 lg:rounded-none lg:border-0 lg:border-r lg:px-4 lg:py-5"
              style={{ borderColor: appPreviewStroke }}
            >
              <div className="grid grid-cols-2 gap-2 px-0.5 sm:grid-cols-3 lg:grid-cols-1">
                {sidebarItems.map((item) => (
                  <DashboardSidebarItem key={item.label} {...item} />
                ))}
              </div>
            </aside>

            <main
              className="order-1 rounded-[1.5rem] border bg-background px-3 py-4 sm:px-4 sm:py-5 md:px-6 lg:order-2 lg:rounded-none lg:border-0 lg:px-5 lg:py-5"
              style={{ borderColor: appPreviewStroke }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Welcome back, Jane</p>
                  <p className="mt-1 text-[11px] text-foreground/70">
                    Your US visitor visa file is improving after each revision.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-foreground/82 sm:pt-1">
                  Revision 2 of 3
                </span>
              </div>

              <div className="mt-4 grid w-full grid-cols-2 gap-2 sm:mt-5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2.5">
                {actionItems.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-center text-[11px] font-semibold",
                      item.accent
                        ? "bg-foreground text-background shadow-sm"
                        : "border bg-background text-foreground",
                    )}
                    style={item.accent ? undefined : { borderColor: appPreviewStroke }}
                  >
                    {item.label}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-4 xl:flex-row">
                <section
                  className="min-w-0 basis-0 flex-1 rounded-[1.45rem] border bg-background px-4 py-4 sm:px-5"
                  style={{ borderColor: appPreviewStroke }}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">Readiness Score</p>
                    <Check className="h-4 w-4 text-foreground/90" />
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <p className="text-[2.5rem] leading-none font-semibold tracking-tight text-foreground sm:text-[3.1rem]">
                      74
                    </p>
                    <p className="pb-1 text-[12px] text-foreground/70">/ 100</p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/58">
                        Last 30 Days
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground/60">Risk dropped</p>
                      <p className="mt-1 font-semibold text-foreground/86">-18 pts</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground/60">Issues left</p>
                      <p className="mt-1 font-semibold text-foreground/86">2 open</p>
                    </div>
                  </div>

                  <svg
                    viewBox="0 0 360 80"
                    className="mt-5 h-20 w-full"
                    fill="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="vidicy-readiness-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--accent) / 0.15)" />
                        <stop offset="100%" stopColor="hsl(var(--accent) / 0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 62 C 26 60, 50 52, 76 50 C 103 48, 122 58, 150 52 C 177 46, 198 30, 224 28 C 250 26, 280 34, 308 26 C 328 21, 344 15, 360 12 L360 80 L0 80 Z"
                      fill="url(#vidicy-readiness-fill)"
                    />
                    <path
                      d="M0 62 C 26 60, 50 52, 76 50 C 103 48, 122 58, 150 52 C 177 46, 198 30, 224 28 C 250 26, 280 34, 308 26 C 328 21, 344 15, 360 12"
                      stroke="hsl(var(--accent))"
                      strokeWidth="1.5"
                    />
                  </svg>
                </section>

                <section
                  className="min-w-0 basis-0 flex-1 rounded-[1.45rem] border bg-background px-4 py-4 sm:px-5"
                  style={{ borderColor: appPreviewStroke }}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">Embassy Checklist</p>
                    <div className="flex items-center gap-2.5 text-foreground/72">
                      <Plus className="h-3.5 w-3.5" />
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <div className="mt-5">
                    {checklistRows.map(([label, status]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between border-b py-3 text-xs last:border-b-0"
                        style={{ borderColor: appPreviewSoftStroke }}
                      >
                        <span className="text-foreground">{label}</span>
                        <span className="text-[10px] font-semibold text-foreground/74">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section
                className="mt-4 rounded-[1.45rem] border bg-background px-4 py-4 sm:px-5"
                style={{ borderColor: appPreviewStroke }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">Flagged Issues</p>
                  <span className="text-[10px] text-foreground/66">Atlas ready for follow-up</span>
                </div>

                <div className="mt-4 space-y-3 lg:hidden">
                  {flaggedIssues.map((item) => (
                    <div
                      key={item.item}
                      className="rounded-[1.2rem] border border-border/80 bg-secondary/35 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{item.item}</p>
                          <p className="mt-1 text-[11px] leading-5 text-foreground/70">
                            {item.detail}
                          </p>
                        </div>
                        <SeverityPill severity={item.severity} />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-foreground/62">
                        <span>Status</span>
                        <span className="font-semibold text-foreground/78">{item.status}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <table className="mt-4 hidden w-full table-fixed text-left text-xs lg:table">
                  <thead className="text-[10px] uppercase tracking-[0.16em] text-foreground/54">
                    <tr>
                      <th className="pb-3 font-medium">Document</th>
                      <th className="pb-3 font-medium">Issue</th>
                      <th className="pb-3 font-medium">Risk</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {flaggedIssues.map((item) => (
                      <tr key={item.item}>
                        <td className="py-2.5">{item.item}</td>
                        <td className="py-2.5 text-foreground/70">{item.detail}</td>
                        <td className="py-2.5">
                          <SeverityPill severity={item.severity} />
                        </td>
                        <td className="py-2.5 text-foreground/62">{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </main>
          </div>
        </div>
      </div>
    </FadeUp>
  );
}
