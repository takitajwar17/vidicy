"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateEnterpriseInquiryStatusAction } from "@/actions/enterprise.action";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  BuildingIcon,
  MailIcon,
  UsersIcon,
  CalendarIcon,
  TrendingUpIcon,
  GlobeIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { EnterpriseInquiry } from "@/db/schema";

const STATUS_CONFIG = {
  new: {
    label: "New",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  contacted: {
    label: "Contacted",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  },
  closed: {
    label: "Closed",
    className: "bg-muted text-muted-foreground border-border",
  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const cfg =
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs px-2 h-5 rounded-full font-normal",
        cfg.className,
      )}
    >
      {cfg.label}
    </Badge>
  );
}

function InquiryDetail({
  inquiry,
  onUpdate,
}: {
  inquiry: EnterpriseInquiry;
  onUpdate: (updated: EnterpriseInquiry) => void;
}) {
  const [status, setStatus] = useState<"new" | "contacted" | "closed">(
    inquiry.status as "new" | "contacted" | "closed",
  );
  const [adminNote, setAdminNote] = useState(inquiry.adminNote ?? "");

  const { execute, isPending } = useServerAction(
    updateEnterpriseInquiryStatusAction,
    {
      onSuccess: (result) => {
        toast.success("Saved.");
        onUpdate(result as unknown as EnterpriseInquiry);
      },
      onError: ({ err }) => toast.error(err.message ?? "Failed to save."),
    },
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{inquiry.name}</h2>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
              <BuildingIcon className="h-3.5 w-3.5" />
              {inquiry.company}
              {inquiry.role && (
                <span className="text-muted-foreground/60">
                  · {inquiry.role}
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={inquiry.status} />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-6">
          {/* Contact details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
              <MailIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-2xs text-muted-foreground uppercase tracking-wider">
                  Email
                </p>
                <p className="text-sm font-medium truncate">{inquiry.email}</p>
              </div>
            </div>
            {inquiry.teamSize && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
                <UsersIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xs text-muted-foreground uppercase tracking-wider">
                    Team size
                  </p>
                  <p className="text-sm font-medium">{inquiry.teamSize}</p>
                </div>
              </div>
            )}
            {inquiry.website && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
                <GlobeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-2xs text-muted-foreground uppercase tracking-wider">
                    Website
                  </p>
                  <a
                    href={inquiry.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary truncate block hover:underline"
                  >
                    {inquiry.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              </div>
            )}
            {inquiry.monthlyVolume && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
                <TrendingUpIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-2xs text-muted-foreground uppercase tracking-wider">
                    Monthly apps
                  </p>
                  <p className="text-sm font-medium">{inquiry.monthlyVolume}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5">
              <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xs text-muted-foreground uppercase tracking-wider">
                  Received
                </p>
                <p className="text-sm font-medium">
                  {new Date(inquiry.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Message */}
          {inquiry.message && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Message
              </p>
              <div className="rounded-xl bg-muted/40 border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {inquiry.message}
              </div>
            </div>
          )}

          {/* Admin actions */}
          <div className="space-y-3 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Admin
            </p>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground shrink-0">Status</p>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
              >
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Internal note (not visible to the user)…"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="resize-none text-sm min-h-[80px]"
              maxLength={2000}
            />
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                execute({
                  id: inquiry.id,
                  status,
                  adminNote: adminNote || undefined,
                })
              }
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function EnterpriseInquiriesClient({
  inquiries: initial,
}: {
  inquiries: EnterpriseInquiry[];
}) {
  const [inquiries, setInquiries] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  );

  const selected = inquiries.find((i) => i.id === selectedId) ?? null;

  function handleUpdate(updated: EnterpriseInquiry) {
    setInquiries((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i)),
    );
  }

  if (inquiries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
          <BuildingIcon className="h-10 w-10 text-primary relative z-10" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="text-lg font-semibold">No enterprise inquiries yet</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When organizations submit enterprise inquiries, they will appear
            here for review and follow-up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-160px)] rounded-xl border overflow-hidden">
      {/* Left panel — list */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="px-4 py-3 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {inquiries.length} inquir{inquiries.length === 1 ? "y" : "ies"} ·{" "}
            {inquiries.filter((i) => i.status === "new").length} new
          </p>
        </div>
        <ScrollArea className="flex-1">
          {inquiries.map((inquiry) => (
            <button
              key={inquiry.id}
              type="button"
              onClick={() => setSelectedId(inquiry.id)}
              className={cn(
                "w-full text-left px-4 py-3.5 border-b transition-colors hover:bg-muted/40 space-y-1",
                selectedId === inquiry.id ? "bg-muted/60" : "",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{inquiry.name}</p>
                <StatusBadge status={inquiry.status} />
              </div>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <BuildingIcon className="h-3 w-3 shrink-0" />
                {inquiry.company}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {formatDistanceToNow(new Date(inquiry.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <InquiryDetail
            key={selected.id}
            inquiry={selected}
            onUpdate={handleUpdate}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an inquiry to view details
          </div>
        )}
      </div>
    </div>
  );
}
