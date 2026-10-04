"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SearchIcon,
  MessageSquareIcon,
  PlusIcon,
  ChevronDownIcon,
  Loader2Icon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { SupportTicket, SupportMessage } from "@/db/schema";
import { UserTicketDetail } from "./user-ticket-detail";
import { NewTicketPanel } from "./new-ticket-panel";
import {
  getSupportTicketDetailAction,
  getUserTicketsAction,
} from "@/actions/support.action";

export type UserTicketSummary = SupportTicket & {
  lastMessageContent: string | null;
  lastMessageIsAdminReply: boolean | null;
  lastMessageIsSystemMessage: boolean | null;
  messageSearchText: string;
};

export type UserTicketDetailData = SupportTicket & {
  messages: SupportMessage[];
};

interface UserInboxClientProps {
  initialTickets: UserTicketSummary[];
  totalCount: number;
}

const STATUS_FILTERS = [
  "all",
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;

export function UserInboxClient({
  initialTickets,
  totalCount,
}: UserInboxClientProps) {
  const router = useRouter();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"ticket" | "new" | "empty">(
    totalCount === 0 ? "new" : "empty",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locallyReadAt, setLocallyReadAt] = useState<Record<string, number>>(
    {},
  );
  const [mounted, setMounted] = useState(false);
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedTicket, setSelectedTicket] =
    useState<UserTicketDetailData | null>(null);
  const [isSelectedTicketLoading, setIsSelectedTicketLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const selectedTicketRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadSelectedTicket = useCallback(async ({ ticketId }: { ticketId: string }) => {
    const requestId = selectedTicketRequestIdRef.current + 1;
    selectedTicketRequestIdRef.current = requestId;

    if (selectedTicket?.id !== ticketId) {
      setSelectedTicket(null);
    }
    setIsSelectedTicketLoading(true);

    try {
      const [result] = await getSupportTicketDetailAction({ ticketId });

      if (selectedTicketRequestIdRef.current !== requestId) {
        return;
      }

      const ticketDetail = result as UserTicketDetailData | undefined;

      setSelectedTicket(
        ticketDetail
          ? {
              ...ticketDetail,
              messages: [...ticketDetail.messages].sort(
                (leftMessage, rightMessage) =>
                  new Date(leftMessage.createdAt).getTime() -
                  new Date(rightMessage.createdAt).getTime(),
              ),
            }
          : null,
      );
    } finally {
      if (selectedTicketRequestIdRef.current === requestId) {
        setIsSelectedTicketLoading(false);
      }
    }
  }, [selectedTicket?.id]);

  // Reset tickets when server refreshes (e.g. after new ticket submitted)
  useEffect(() => {
    setTickets(initialTickets);
    setCurrentPage(1);
  }, [initialTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      selectedTicketRequestIdRef.current += 1;
      setSelectedTicket(null);
      setIsSelectedTicketLoading(false);
      return;
    }

    if (!tickets.some((ticket) => ticket.id === selectedTicketId)) {
      return;
    }

    void loadSelectedTicket({ ticketId: selectedTicketId });
  }, [tickets, selectedTicketId, loadSelectedTicket]);

  async function handleLoadMore() {
    setIsLoadingMore(true);
    try {
      const [result] = await getUserTicketsAction({ page: currentPage + 1 });
      if (result?.tickets) {
        setTickets((prev) => [
          ...prev,
          ...(result.tickets as UserTicketSummary[]),
        ]);
        setCurrentPage((p) => p + 1);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Auto-refresh every 30 seconds to pick up new admin replies
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tickets.filter((t) => {
      const matchesSearch =
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.messageSearchText.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tickets, searchQuery, statusFilter]);

  const onNewTicket = () => {
    setSelectedTicketId(null);
    setViewMode("new");
  };

  const onBack = () => {
    setSelectedTicketId(null);
    setViewMode("empty");
  };

  const onSelectTicket = (id: string) => {
    if (selectedTicketId !== id) {
      setSelectedTicket(null);
      setIsSelectedTicketLoading(true);
    }
    setSelectedTicketId(id);
    setLocallyReadAt((prev) => ({ ...prev, [id]: Date.now() }));
    setViewMode("ticket");
  };

  if (!mounted) {
    return <div className="flex-1 bg-background" />;
  }

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      {/* Left panel — full width on mobile, 40% on md+ */}
      <div
        className={cn(
          "flex-col bg-card border-r h-full overflow-hidden",
          "w-full md:w-[40%]",
          // Hide left panel when creating new ticket or viewing a ticket on mobile
          viewMode === "new"
            ? "hidden"
            : viewMode !== "empty"
              ? "hidden md:flex"
              : "flex",
        )}
      >
        {/* Header */}
        <div className="shrink-0">
          <PageHeader items={[{ href: "/dashboard", label: "Dashboard" }, { href: "/dashboard/support", label: "Support" }]} />
        </div>

        {/* Search + status filter bar */}
        <div className="px-4 lg:px-6 py-3 border-b shrink-0 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="relative group flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search support threads..."
                className="pl-10 h-9 bg-muted/50 border-none focus-visible:ring-1 text-sm w-full transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={onNewTicket}
              className="h-9 gap-1.5 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" /> New thread
            </Button>
          </div>

          {initialTickets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => {
                const isSelected = statusFilter === s;
                return (
                  <Button
                    key={s}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(s)}
                    className="h-7 px-2.5 text-xs capitalize"
                  >
                    {s.replace(/_/g, " ")}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ticket list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col">
            {filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquareIcon className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2 max-w-sm">
                  <p className="text-lg font-semibold">No support threads</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {searchQuery || statusFilter !== "all"
                      ? "No support threads match that search or status."
                      : "Send us the case, file, or screen where you are stuck. We usually respond within a few hours."}
                  </p>
                </div>
                {!searchQuery && statusFilter === "all" && (
                  <Button
                    onClick={onNewTicket}
                    className="shadow-lg hover:shadow-primary/10 transition-all hover:-translate-y-0.5"
                  >
                    <PlusIcon className="h-4 w-4" />
                    New thread
                  </Button>
                )}
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isActive = ticket.id === selectedTicketId;

                // Unread logic: last activity is an admin reply and it's newer than last viewed / locally read
                const lastIsAdminReply =
                  ticket.lastMessageContent === null
                    ? false
                    : ticket.lastMessageIsAdminReply === true;
                const lastUpdateTs = new Date(
                  ticket.lastUpdatedAt ?? ticket.createdAt,
                ).getTime();
                const serverReadTs = ticket.lastViewedAt
                  ? new Date(ticket.lastViewedAt).getTime()
                  : 0;
                const localReadTs = locallyReadAt[ticket.id] ?? 0;
                const isUnread =
                  !isActive &&
                  lastIsAdminReply &&
                  lastUpdateTs > Math.max(serverReadTs, localReadTs);

                const lastMessage =
                  ticket.lastMessageContent ?? ticket.description;

                return (
                  <button
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 lg:px-5 py-4 text-left transition-all border-b last:border-b-0 w-full relative",
                      isActive
                        ? "bg-primary/[0.03] shadow-inner"
                        : isUnread
                          ? "bg-primary/[0.06]"
                          : "hover:bg-muted/50",
                    )}
                  >
                    {/* Active left border accent */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}

                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      {/* Subject + timestamp */}
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={cn(
                              "text-sm truncate transition-colors",
                              isUnread
                                ? "font-bold text-foreground"
                                : "font-medium text-foreground/80",
                              isActive && "text-primary",
                            )}
                          >
                            {ticket.subject}
                          </span>
                          {isUnread && (
                            <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                          )}
                        </div>
                        <span className="text-xs font-mono tabular-nums text-muted-foreground whitespace-nowrap shrink-0">
                          {formatDistanceToNow(
                            new Date(ticket.lastUpdatedAt ?? ticket.createdAt),
                            {
                              addSuffix: false,
                            },
                          )}
                        </span>
                      </div>

                      {/* Last message preview */}
                      <p className="text-xs truncate text-muted-foreground">
                        {lastMessage}
                      </p>

                      {/* Status badge + category */}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={cn(
                          "h-5 px-1.5 text-xs capitalize font-medium border",
                          ticket.status === "open"
                            ? "bg-status-info/10 text-status-info border-status-info/20"
                            : ticket.status === "in_progress"
                              ? "bg-status-warning/10 text-status-warning border-status-warning/20"
                              : ticket.status === "resolved"
                                ? "bg-status-success/10 text-status-success border-status-success/20"
                                : "bg-status-neutral/10 text-status-neutral border-status-neutral/20",
                        )}>
                          {ticket.status.replace(/_/g, " ")}
                        </Badge>

                        <Badge variant="outline" className="h-5 px-1.5 text-xs capitalize font-medium bg-primary/5 text-primary/70 border-primary/10">
                          {ticket.category.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            {tickets.length < totalCount && (
              <div className="py-3 flex justify-center border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="gap-2 text-xs"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                      Load {totalCount - tickets.length} more
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel — full width on mobile when active, flex-1 on md+ */}
      <div
        className={cn(
          "flex-col bg-muted/20 h-full overflow-hidden flex-1",
          // On mobile: hide when list view is active (no ticket selected)
          viewMode === "empty" ? "hidden md:flex" : "flex",
        )}
      >
        {viewMode === "new" ? (
          <NewTicketPanel onBack={onBack} />
        ) : viewMode === "ticket" && selectedTicket ? (
          <UserTicketDetail ticket={selectedTicket} onBack={onBack} />
        ) : viewMode === "ticket" && isSelectedTicketLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 h-full">
            <div className="max-w-sm space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
                <Loader2Icon className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Loading conversation</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Fetching the latest support thread.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 h-full">
            <div className="max-w-sm space-y-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mx-auto">
                <MessageSquareIcon className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">How can we help?</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Select a support thread from the left, or start a new one with the case or file where you are stuck.
                </p>
              </div>
              <Button onClick={onNewTicket} className="gap-2">
                <PlusIcon className="h-4 w-4" /> New thread
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
