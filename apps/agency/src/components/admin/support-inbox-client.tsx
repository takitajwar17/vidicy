"use client"

import { useState, useReducer, useMemo, useEffect, useRef, memo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon, MessageSquareIcon, FilterIcon, XIcon, ChevronDownIcon, Loader2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { TicketDetail } from "./ticket-detail"
import { formatDistanceToNow } from "date-fns"
import type { SupportTicket, SupportMessage } from "@/db/schema"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { getAllTicketsAction, getSupportTicketDetailAction } from "@/actions/support.action"

type TicketSummaryWithMeta = SupportTicket & {
  userFirstName: string | null
  userLastName: string | null
  userEmail: string | null
  userAvatar: string | null
  lastMessageContent: string | null
  lastMessageIsAdminReply: boolean | null
  lastMessageIsSystemMessage: boolean | null
  messageSearchText: string
}

type TicketDetailWithMeta = SupportTicket & {
  userFirstName: string | null
  userLastName: string | null
  userEmail: string | null
  userAvatar: string | null
  messages: (SupportMessage & { isSystemMessage: boolean })[]
}

type TicketListRequestMode = "replace" | "append"

export interface TicketListState {
  tickets: TicketSummaryWithMeta[]
  currentPage: number
  isLoadingMore: boolean
  isFiltering: boolean
  activeRequestId: number
}

interface CreateInitialTicketListStateInput {
  tickets: TicketSummaryWithMeta[]
}

type TicketListAction =
  | { type: "RESET_FROM_SERVER"; requestId: number; tickets: TicketSummaryWithMeta[] }
  | { type: "START_REQUEST"; requestId: number; mode: TicketListRequestMode }
  | { type: "RESOLVE_REQUEST"; requestId: number; mode: TicketListRequestMode; page: number; tickets: TicketSummaryWithMeta[] }
  | { type: "FINISH_REQUEST"; requestId: number; mode: TicketListRequestMode }

export function createInitialTicketListState({ tickets }: CreateInitialTicketListStateInput): TicketListState {
  return {
    tickets,
    currentPage: 1,
    isLoadingMore: false,
    isFiltering: false,
    activeRequestId: 0,
  }
}

export function ticketListReducer(state: TicketListState, action: TicketListAction): TicketListState {
  switch (action.type) {
    case "RESET_FROM_SERVER":
      return {
        tickets: action.tickets,
        currentPage: 1,
        isLoadingMore: false,
        isFiltering: false,
        activeRequestId: action.requestId,
      }
    case "START_REQUEST":
      return {
        ...state,
        activeRequestId: action.requestId,
        isFiltering: action.mode === "replace",
        isLoadingMore: action.mode === "append",
      }
    case "RESOLVE_REQUEST":
      if (action.requestId !== state.activeRequestId) {
        return state
      }

      return {
        ...state,
        tickets:
          action.mode === "append"
            ? [...state.tickets, ...action.tickets]
            : action.tickets,
        currentPage: action.page,
      }
    case "FINISH_REQUEST":
      if (action.requestId !== state.activeRequestId) {
        return state
      }

      return {
        ...state,
        isFiltering: action.mode === "replace" ? false : state.isFiltering,
        isLoadingMore: action.mode === "append" ? false : state.isLoadingMore,
      }
    default:
      return state
  }
}

interface SupportInboxClientProps {
  initialTickets: TicketSummaryWithMeta[]
  totalCount: number
  initialSelectedId?: string
  initialSelectedTicket?: TicketDetailWithMeta | null
}

function getInitials(first?: string | null, last?: string | null) {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}` || "U"
}

interface TicketItemProps {
  ticket: TicketSummaryWithMeta
  isActive: boolean
  localReadTs: number
  onSelect: (id: string) => void
}

const TicketItem = memo(function TicketItem({ ticket, isActive, localReadTs, onSelect }: TicketItemProps) {
  const userName = [ticket.userFirstName, ticket.userLastName].filter(Boolean).join(' ') || ticket.userEmail || 'User'

  // Robust Unread Logic:
  // 1. Must not be the active chat
  // 2. The latest activity must be from the USER (not an admin reply or system update)
  // 3. That activity must be newer than the last time the admin viewed it
  const lastIsUser =
    ticket.lastMessageContent === null
      ? true
      : !ticket.lastMessageIsAdminReply && !ticket.lastMessageIsSystemMessage

  const lastUpdateTs = new Date(ticket.lastUpdatedAt || ticket.createdAt).getTime()
  const serverReadTs = ticket.adminLastViewedAt ? new Date(ticket.adminLastViewedAt).getTime() : 0

  const isUnread = !isActive && lastIsUser && lastUpdateTs > Math.max(serverReadTs, localReadTs)

  const lastMessage = ticket.lastMessageContent || ticket.description

  return (
    <button
      onClick={() => onSelect(ticket.id)}
      className={cn(
        "flex items-start gap-3 px-4 lg:px-5 py-4 text-left transition-all border-b last:border-b-0 group w-full relative",
        isActive ? "bg-primary/[0.03] shadow-inner" : isUnread ? "bg-primary/[0.06]" : "hover:bg-muted/50"
      )}
    >
      <Avatar className="h-10 w-10 border shadow-xs shrink-0 mt-0.5">
        <AvatarImage src={ticket.userAvatar || ""} alt={userName} className="object-cover" />
        <AvatarFallback className="bg-muted text-muted-foreground font-semibold text-sm">
          {getInitials(ticket.userFirstName, ticket.userLastName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex justify-between items-center mb-0.5">
          <span className={cn(
            "font-semibold text-sm truncate transition-colors",
            isUnread ? "text-foreground" : "text-muted-foreground/90",
            isActive && "text-primary"
          )}>{userName}</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap font-mono tabular-nums ml-2">
            {formatDistanceToNow(new Date(ticket.lastUpdatedAt || ticket.createdAt), { addSuffix: false })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <h3 className={cn(
            "text-sm truncate leading-tight transition-colors",
            isUnread ? "font-bold text-foreground" : "font-medium text-foreground/80"
          )}>
            {ticket.subject}
          </h3>
          {isUnread && (
            <div className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
          )}
        </div>

        <p className={cn(
          "text-xs truncate leading-snug transition-colors",
          isUnread ? "text-foreground/70 font-medium" : "text-muted-foreground/60"
        )}>
          {lastMessage}
        </p>

          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "h-5 px-1.5 text-xs capitalize font-medium border",
              ticket.status === 'open' ? "bg-status-info/10 text-status-info border-status-info/20" :
              ticket.status === 'in_progress' ? "bg-status-warning/10 text-status-warning border-status-warning/20" :
              ticket.status === 'resolved' ? "bg-status-success/10 text-status-success border-status-success/20" :
              "bg-status-neutral/10 text-status-neutral border-status-neutral/20"
            )}>
              {ticket.status.replace('_', ' ')}
            </Badge>

            <Badge variant="outline" className="h-5 px-1.5 text-xs capitalize font-medium bg-primary/5 text-primary/70 border-primary/10">
              {ticket.category.replace(/_/g, " ")}
            </Badge>
          </div>
      </div>

      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      )}
    </button>
  )
})

interface FilterState {
  searchQuery: string
  statusFilter: string
  categoryFilter: string
  groupByUser: boolean
  isFiltersOpen: boolean
}

type FilterAction =
  | { type: "SET_SEARCH"; value: string }
  | { type: "SET_STATUS"; value: string }
  | { type: "SET_CATEGORY"; value: string }
  | { type: "SET_GROUP_BY_USER"; value: boolean }
  | { type: "SET_FILTERS_OPEN"; value: boolean }
  | { type: "RESET_FILTERS" }

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_SEARCH": return { ...state, searchQuery: action.value }
    case "SET_STATUS": return { ...state, statusFilter: action.value }
    case "SET_CATEGORY": return { ...state, categoryFilter: action.value }
    case "SET_GROUP_BY_USER": return { ...state, groupByUser: action.value }
    case "SET_FILTERS_OPEN": return { ...state, isFiltersOpen: action.value }
    case "RESET_FILTERS": return { ...state, statusFilter: "all", categoryFilter: "all", groupByUser: false }
    default: return state
  }
}

export function SupportInboxClient({
  initialTickets,
  totalCount,
  initialSelectedId,
  initialSelectedTicket = null,
}: SupportInboxClientProps) {
  const router = useRouter()
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialSelectedId ?? null)
  const [selectedTicket, setSelectedTicket] = useState<TicketDetailWithMeta | null>(initialSelectedTicket)
  const [isSelectedTicketLoading, setIsSelectedTicketLoading] = useState(false)
  const [locallyReadAt, setLocallyReadAt] = useState<Record<string, number>>({})
  const [mounted, setMounted] = useState(false)
  const [ticketListState, dispatchTicketList] = useReducer(
    ticketListReducer,
    { tickets: initialTickets },
    createInitialTicketListState,
  )
  const isFirstFilterRender = useRef(true)
  const selectedTicketRequestIdRef = useRef(0)
  const ticketListRequestIdRef = useRef(0)

  const [filters, dispatch] = useReducer(filterReducer, {
    searchQuery: "",
    statusFilter: "all",
    categoryFilter: "all",
    groupByUser: false,
    isFiltersOpen: false,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadSelectedTicket = useCallback(async ({ ticketId }: { ticketId: string }) => {
    const requestId = selectedTicketRequestIdRef.current + 1
    selectedTicketRequestIdRef.current = requestId

    if (selectedTicket?.id !== ticketId) {
      setSelectedTicket(null)
    }
    setIsSelectedTicketLoading(true)

    try {
      const [result] = await getSupportTicketDetailAction({ ticketId })

      if (selectedTicketRequestIdRef.current !== requestId) {
        return
      }

      setSelectedTicket((result as TicketDetailWithMeta | undefined) ?? null)
    } finally {
      if (selectedTicketRequestIdRef.current === requestId) {
        setIsSelectedTicketLoading(false)
      }
    }
  }, [selectedTicket?.id])

  const requestTickets = useCallback(async ({
    page,
    mode,
  }: {
    page: number
    mode: TicketListRequestMode
  }) => {
    const requestId = ticketListRequestIdRef.current + 1
    ticketListRequestIdRef.current = requestId

    dispatchTicketList({ type: "START_REQUEST", requestId, mode })

    try {
      const [result] = await getAllTicketsAction({
        page,
        status: filters.statusFilter !== "all" ? filters.statusFilter : undefined,
        category: filters.categoryFilter !== "all" ? filters.categoryFilter : undefined,
      })

      if (result?.tickets) {
        dispatchTicketList({
          type: "RESOLVE_REQUEST",
          requestId,
          mode,
          page,
          tickets: result.tickets as TicketSummaryWithMeta[],
        })
      }
    } finally {
      dispatchTicketList({ type: "FINISH_REQUEST", requestId, mode })
    }
  }, [filters.categoryFilter, filters.statusFilter])

  // Reset tickets when initialTickets refresh (e.g. via router.refresh)
  useEffect(() => {
    const requestId = ticketListRequestIdRef.current + 1
    ticketListRequestIdRef.current = requestId

    dispatchTicketList({ type: "RESET_FROM_SERVER", requestId, tickets: initialTickets })
  }, [initialTickets])

  useEffect(() => {
    if (!selectedTicketId) {
      selectedTicketRequestIdRef.current += 1
      setSelectedTicket(null)
      setIsSelectedTicketLoading(false)
      return
    }

    if (!ticketListState.tickets.some((ticket) => ticket.id === selectedTicketId)) {
      return
    }

    void loadSelectedTicket({ ticketId: selectedTicketId })
  }, [ticketListState.tickets, selectedTicketId, loadSelectedTicket])

  // Re-fetch from server when filters change (skip initial mount)
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false
      return
    }
    void requestTickets({ page: 1, mode: "replace" })
  }, [filters.statusFilter, filters.categoryFilter, requestTickets])

  // Auto-clear selection when the selected ticket is removed (e.g. after delete)
  useEffect(() => {
    if (selectedTicketId && !ticketListState.tickets.find((ticket) => ticket.id === selectedTicketId)) {
      selectedTicketRequestIdRef.current += 1
      setSelectedTicket(null)
      setIsSelectedTicketLoading(false)
      setSelectedTicketId(null)
    }
  }, [ticketListState.tickets, selectedTicketId])

  // Auto-refresh every 30 seconds to pick up new messages/tickets
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(id)
  }, [router])

  async function handleLoadMore() {
    await requestTickets({
      page: ticketListState.currentPage + 1,
      mode: "append",
    })
  }

  const filteredTickets = useMemo(() => {
    return ticketListState.tickets.filter(ticket => {
      const searchLower = filters.searchQuery.toLowerCase()
      const userName = `${ticket.userFirstName || ""} ${ticket.userLastName || ""}`.toLowerCase()

      const matchesMain =
        userName.includes(searchLower) ||
        ticket.subject.toLowerCase().includes(searchLower) ||
        ticket.userEmail?.toLowerCase().includes(searchLower) ||
        ticket.description.toLowerCase().includes(searchLower)

      const matchesMessages = ticket.messageSearchText.toLowerCase().includes(searchLower)

      const matchesSearch = matchesMain || matchesMessages
      const matchesStatus = filters.statusFilter === "all" || ticket.status === filters.statusFilter
      const matchesCategory = filters.categoryFilter === "all" || ticket.category === filters.categoryFilter

      return matchesSearch && matchesStatus && matchesCategory
    })
  }, [ticketListState.tickets, filters.searchQuery, filters.statusFilter, filters.categoryFilter])

  const groupedTickets = useMemo(() => {
    if (!filters.groupByUser) return null;

    const groups: Record<string, TicketSummaryWithMeta[]> = {};
    filteredTickets.forEach(ticket => {
      const key = ticket.userId || ticket.userEmail || "anonymous";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ticket);
    });

    return Object.entries(groups).sort(([, a], [, b]) => {
      const latestA = Math.max(...a.map(t => new Date(t.lastUpdatedAt || t.createdAt).getTime()));
      const latestB = Math.max(...b.map(t => new Date(t.lastUpdatedAt || t.createdAt).getTime()));
      return latestB - latestA;
    });
  }, [filteredTickets, filters.groupByUser])

  const handleSelectTicket = useCallback((id: string) => {
    if (selectedTicketId !== id) {
      setSelectedTicket(null)
      setIsSelectedTicketLoading(true)
    }
    setSelectedTicketId(id)
    setLocallyReadAt(prev => ({ ...prev, [id]: Date.now() }))
  }, [selectedTicketId])

  const clearFilters = () => {
    dispatch({ type: "RESET_FILTERS" })
  }

  if (!mounted) {
    return <div className="flex-1 bg-background" />
  }

  const activeFiltersCount = (filters.statusFilter !== "all" ? 1 : 0) + (filters.categoryFilter !== "all" ? 1 : 0) + (filters.groupByUser ? 1 : 0)

  const renderTicketItem = (ticket: TicketSummaryWithMeta) => (
    <TicketItem
      key={ticket.id}
      ticket={ticket}
      isActive={ticket.id === selectedTicketId}
      localReadTs={locallyReadAt[ticket.id] || 0}
      onSelect={handleSelectTicket}
    />
  )

  return (
    <div className="flex-1 flex min-h-0 w-full bg-background overflow-hidden border-t">
      {/* Left Sidebar — full width on mobile, 40% on md+ */}
      <div className={cn(
        "flex-col bg-card border-r min-w-0 h-full overflow-hidden",
        "w-full md:w-[40%]",
        // On mobile: hide list panel when a ticket is selected
        selectedTicketId ? "hidden md:flex" : "flex"
      )}>
        <div className="shrink-0">
          <PageHeader items={[{ href: "/admin", label: "Admin" }, { href: "/admin/support", label: "Support Inbox" }]} />
        </div>

        <div className="px-4 lg:px-6 py-4 border-b shrink-0 bg-background/50 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 group">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search conversations..."
                className="pl-10 h-10 bg-muted/50 border-none focus-visible:ring-1 text-sm w-full transition-all"
                value={filters.searchQuery}
                onChange={(e) => dispatch({ type: "SET_SEARCH", value: e.target.value })}
              />
            </div>
            <Button
              variant={filters.isFiltersOpen ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl transition-all",
                filters.isFiltersOpen && "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              )}
              onClick={() => dispatch({ type: "SET_FILTERS_OPEN", value: !filters.isFiltersOpen })}
            >
              <div className="relative">
                <FilterIcon className="h-5 w-5" />
                {activeFiltersCount > 0 && !filters.isFiltersOpen && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground border-2 border-background shadow-xs">
                    {activeFiltersCount}
                  </span>
                )}
              </div>
            </Button>
          </div>

          <Collapsible open={filters.isFiltersOpen} onOpenChange={(open: boolean) => dispatch({ type: "SET_FILTERS_OPEN", value: open })} className="w-full">
            <CollapsibleContent className="pt-3 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
              <div className="space-y-3 bg-muted/30 p-3 rounded-xl border border-border/50 shadow-inner">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase text-foreground tracking-wider leading-none">Group by User</span>
                  <Switch
                    checked={filters.groupByUser}
                    onCheckedChange={(checked: boolean) => dispatch({ type: "SET_GROUP_BY_USER", value: checked })}
                    className="data-[state=checked]:bg-primary scale-75 origin-right"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wider leading-none ml-1">Status</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["all", "open", "in_progress", "resolved", "closed"].map((s) => {
                      const isSelected = filters.statusFilter === s;
                      return (
                        <Button
                          key={s}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => dispatch({ type: "SET_STATUS", value: s })}
                          className="h-7 px-2.5 text-xs capitalize"
                        >
                          {s.replace("_", " ")}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-wider leading-none ml-1">Category</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["all", "bug", "feedback", "question", "feature_request", "other"].map((c) => {
                      const isSelected = filters.categoryFilter === c;
                      return (
                        <Button
                          key={c}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => dispatch({ type: "SET_CATEGORY", value: c })}
                          className="h-7 px-2.5 text-xs capitalize"
                        >
                          {c.replace("_", " ")}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-destructive gap-1"
                    onClick={clearFilters}
                  >
                    <XIcon className="h-3 w-3" />
                    Reset Filters
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {ticketListState.isFiltering ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
          <div className="flex flex-col">
            {filters.groupByUser && groupedTickets ? (
              groupedTickets.map(([userId, tickets]) => {
                const firstTicket = tickets[0];
                const userName = [firstTicket.userFirstName, firstTicket.userLastName].filter(Boolean).join(' ') || firstTicket.userEmail || 'User'

                return (
                  <div key={userId} className="flex flex-col">
                    <div className="px-4 lg:px-6 py-2 bg-muted/30 border-b flex items-center justify-between shadow-inner gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-primary/60 truncate max-w-[140px]">{userName}</span>
                        <Separator orientation="vertical" className="h-2 opacity-20 shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground/60 truncate tabular-nums min-w-0">{firstTicket.userEmail}</span>
                      </div>
                      <Badge variant="secondary" className="h-5 text-xs px-2 font-semibold bg-primary/10 text-primary border-none rounded-full shrink-0">
                        {tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}
                      </Badge>
                    </div>
                    {tickets.map(renderTicketItem)}
                  </div>
                )
              })
            ) : (
              filteredTickets.map(renderTicketItem)
            )}
            {filteredTickets.length === 0 && (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4 mt-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquareIcon className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">No conversations</p>
                  <p className="text-sm opacity-60">No tickets match your current filters</p>
                </div>
              </div>
            )}
            {ticketListState.tickets.length < totalCount && (
              <div className="py-3 flex justify-center border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={ticketListState.isLoadingMore}
                  className="gap-2 text-xs"
                >
                  {ticketListState.isLoadingMore ? (
                    <><Loader2Icon className="h-3.5 w-3.5 animate-spin" />Loading...</>
                  ) : (
                    <><ChevronDownIcon className="h-3.5 w-3.5" />Load {totalCount - ticketListState.tickets.length} more</>
                  )}
                </Button>
              </div>
            )}
          </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Main Area — full screen on mobile when active, flex-1 on md+ */}
      <div className={cn(
        "flex-col min-w-0 bg-muted/30 dark:bg-background h-full overflow-hidden flex-1",
        // On mobile: hide chat area when no ticket is selected
        !selectedTicketId ? "hidden md:flex" : "flex"
      )}>
        {selectedTicket ? (
          <TicketDetail ticket={selectedTicket} onBack={() => setSelectedTicketId(null)} />
        ) : isSelectedTicketLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="max-w-sm space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
                <Loader2Icon className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Loading conversation</h2>
                <p className="text-sm text-muted-foreground">
                  Fetching the latest ticket details.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="max-w-md space-y-6">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 mx-auto">
                <MessageSquareIcon className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">Support Desk</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed font-medium">
                  Select a user conversation from the left to start responding to tickets and managing support requests.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
