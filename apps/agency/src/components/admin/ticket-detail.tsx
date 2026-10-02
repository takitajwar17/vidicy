"use client"

import { useState, useRef, useEffect } from "react"
import { useServerAction } from "zsa-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { MAX_SUPPORT_FILE_SIZE } from "@/constants"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Trash2Icon, SendIcon, PaperclipIcon, MoreVerticalIcon, Loader2Icon, XIcon, ChevronLeftIcon } from "lucide-react"
import { updateTicketStatusAction, deleteTicketAction, addSupportMessageAction, markTicketAsViewedByAdminAction } from "@/actions/support.action"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { SupportTicket, SupportMessage } from "@/db/schema"

interface UploadedScreenshot {
  fileKey: string
  previewUrl: string
  name: string
}

interface TicketDetailProps {
  onBack?: () => void
  ticket: SupportTicket & {
    userFirstName?: string | null
    userLastName?: string | null
    userEmail?: string | null
    userAvatar?: string | null
    messages: (SupportMessage & { isSystemMessage: boolean })[]
  }
}

export function TicketDetail({ ticket, onBack }: TicketDetailProps) {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [status, setStatus] = useState(ticket.status)
  const [priority, setPriority] = useState(ticket.priority)
  const [category, setCategory] = useState(ticket.category)
  const [adminNote, setAdminNote] = useState(ticket.adminNote ?? "")
  const [replyContent, setReplyContent] = useState("")
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset local state when the selected ticket changes (not on every metadata update)
  useEffect(() => {
    setStatus(ticket.status)
    setPriority(ticket.priority)
    setCategory(ticket.category)
    setAdminNote(ticket.adminNote ?? "")
    setReplyContent("")
    screenshots.forEach(s => URL.revokeObjectURL(s.previewUrl))
    setScreenshots([])
    setUploading(false)

    executeMarkViewed({ ticketId: ticket.id })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  const { execute: executeSave, isPending: isSaving } = useServerAction(updateTicketStatusAction, {
    onSuccess: () => {
      router.refresh()
    },
    onError: ({ err }) => {
      toast.error(err.message || "Error")
    },
  })

  const { execute: executeReply, isPending: isReplying } = useServerAction(addSupportMessageAction, {
    onSuccess: () => {
      setReplyContent("")
      screenshots.forEach(s => URL.revokeObjectURL(s.previewUrl))
      setScreenshots([])
      router.refresh()
    },
    onError: (err) => {
      toast.error(err.err.message || "Failed to send")
    }
  })

  const { execute: executeDelete, isPending: isDeleting } = useServerAction(deleteTicketAction, {
    onSuccess: () => {
      toast.success("Deleted")
      router.refresh()
    },
    onError: ({ err }) => {
      toast.error(err.message || "Error")
    },
  })

  const { execute: executeMarkViewed } = useServerAction(markTicketAsViewedByAdminAction, {
    onSuccess: () => router.refresh(),
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [ticket.messages])

  const sortedMessages = [...ticket.messages].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const userName = [ticket.userFirstName, ticket.userLastName].filter(Boolean).join(' ') || ticket.userEmail || 'User'
  const getInitials = (first?: string | null, last?: string | null) => {
    return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}` || "U"
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ""

    const available = 3 - screenshots.length
    const toUpload = files.slice(0, available)

    for (const file of toUpload) {
      if (file.size > MAX_SUPPORT_FILE_SIZE) {
        toast.error(`"${file.name}" is too large (max 5 MB)`)
        continue
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image`)
        continue
      }
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/upload-support-screenshot", { method: "POST", body: fd })
        const json = await res.json() as { success?: boolean; fileKey?: string; error?: string }
        if (!res.ok || !json.fileKey) {
          toast.error(json.error || `Failed to upload "${file.name}"`)
          continue
        }
        setScreenshots(prev => [...prev, { fileKey: json.fileKey!, previewUrl: URL.createObjectURL(file), name: file.name }])
      } catch {
        toast.error(`Failed to upload "${file.name}"`)
      } finally {
        setUploading(false)
      }
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!replyContent.trim() || isReplying || uploading) return
      executeReply({ ticketId: ticket.id, content: replyContent, isAdminReply: true, screenshotUrls: screenshots.map(s => s.fileKey) })
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Primary Topbar - Identity Focus */}
      <div className="h-16 px-4 lg:px-6 bg-card border-b flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile-only back button to return to ticket list */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="md:hidden h-8 w-8 -ml-1"
              aria-label="Back to ticket list"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
          )}
          <Avatar className="h-10 w-10 border shadow-xs">
            <AvatarImage src={ticket.userAvatar || ""} alt={userName} className="object-cover" />
            <AvatarFallback className="bg-primary/5 text-primary font-semibold text-xs">
              {getInitials(ticket.userFirstName, ticket.userLastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm leading-tight truncate">{userName}</span>
            <span className="text-xs text-muted-foreground font-medium font-mono tabular-nums">{ticket.userEmail}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete this support ticket? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => executeDelete({ ticketId: ticket.id })}
                  disabled={isDeleting}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground">
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(ticket.id)}>
                Copy ticket ID
              </DropdownMenuItem>
              {ticket.userEmail && (
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(ticket.userEmail!)}>
                  Copy user email
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sticky Secondary Header - Standardized Styles */}
      <div className="bg-background/95 backdrop-blur-md border-b z-20 shrink-0 sticky top-0 flex flex-col shadow-sm">
        {/* Subject Row */}
        <div className="px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-sm font-semibold tracking-tight truncate text-foreground/90 max-w-[500px]">
              {ticket.subject}
            </h2>
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              ID-{ticket.id.slice(-6)}
            </span>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant="secondary" className="capitalize text-xs font-semibold px-2 py-0 h-5 bg-primary/5 text-primary border-primary/10">
              {ticket.category.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* Dropdowns Row - Enterprise Form Style */}
        <div className="px-4 lg:px-6 pb-3 flex items-center justify-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-0.5">Category</span>
            <Select value={category} onValueChange={(val) => {
              const newCategory = val as any
              setCategory(newCategory)
              executeSave({ ticketId: ticket.id, status: status as any, priority: priority as any, category: newCategory, adminNote })
            }}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs font-medium border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors shadow-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug" className="text-xs">Bug Report</SelectItem>
                <SelectItem value="feedback" className="text-xs">Feedback</SelectItem>
                <SelectItem value="question" className="text-xs">Question</SelectItem>
                <SelectItem value="feature_request" className="text-xs">Feature Request</SelectItem>
                <SelectItem value="other" className="text-xs">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-0.5">Status</span>
            <Select value={status} onValueChange={(val) => {
              const newStatus = val as any
              setStatus(newStatus)
              executeSave({ ticketId: ticket.id, status: newStatus, priority: priority as any, category: category as any, adminNote })
            }}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs font-medium border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors shadow-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open" className="text-xs">Open</SelectItem>
                <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                <SelectItem value="resolved" className="text-xs">Resolved</SelectItem>
                <SelectItem value="closed" className="text-xs">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-0.5">Priority</span>
            <Select value={priority} onValueChange={(val) => {
              const newPriority = val as any
              setPriority(newPriority)
              executeSave({ ticketId: ticket.id, status: status as any, priority: newPriority, category: category as any, adminNote })
            }}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs font-medium border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors shadow-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-xs">Low</SelectItem>
                <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                <SelectItem value="high" className="text-xs">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-background/50" ref={scrollRef}>
        <div className="flex justify-center">
          <div className="bg-muted/50 text-xs text-muted-foreground px-4 py-1 rounded-md font-medium tracking-wider border border-border/20">
            Ticket opened · {new Date(ticket.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* User's Original Message (left-aligned on admin, it's the user) */}
        <div className="flex flex-col gap-1 items-start">
          <span className="text-xs font-medium text-muted-foreground pl-[44px]">
            {userName}
          </span>
          <div className="flex items-end gap-3">
            <Avatar className="h-8 w-8 shrink-0 rounded-full">
              <AvatarImage src={ticket.userAvatar || ""} alt={userName} className="object-cover" />
              <AvatarFallback className="rounded-full text-xs font-semibold">
                {getInitials(ticket.userFirstName, ticket.userLastName)}
              </AvatarFallback>
            </Avatar>
            <div className="rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground max-w-[85%] sm:max-w-[75%]">
              <p className="leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              {ticket.screenshotUrls && ticket.screenshotUrls.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t pt-3 border-border/20">
                  {ticket.screenshotUrls.map((key, i) => (
                    <a key={key} href={`/api/support-screenshot?key=${encodeURIComponent(key)}`} target="_blank" rel="noopener noreferrer" className="relative block aspect-square rounded-md overflow-hidden border border-border/50 bg-muted/20 hover:opacity-90 transition-all">
                      <Image src={`/api/support-screenshot?key=${encodeURIComponent(key)}`} alt={`Screenshot ${i + 1}`} fill className="object-cover" sizes="(max-width: 640px) 50vw, 20vw" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono pl-[44px]">{new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Message Thread */}
        {sortedMessages.map((msg) => {
          if (msg.isSystemMessage) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-muted/50 text-xs text-muted-foreground px-3 py-1 rounded-md font-medium tracking-wider border border-border/10">
                  {msg.content} · {new Date(msg.createdAt).toLocaleDateString()}
                </div>
              </div>
            )
          }

          const isAdmin = msg.isAdminReply

          if (isAdmin) {
            // Admin messages (right-aligned, "You" on admin side)
            return (
              <div key={msg.id} className="flex flex-col gap-1 items-end">
                <span className="text-xs font-medium text-muted-foreground">
                  You
                </span>
                <div className="rounded-xl px-4 py-2.5 text-sm bg-primary text-primary-foreground max-w-[85%] sm:max-w-[75%]">
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.screenshotUrls && msg.screenshotUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t pt-3 border-primary-foreground/20">
                      {msg.screenshotUrls.map((key, i) => (
                        <a key={key} href={`/api/support-screenshot?key=${encodeURIComponent(key)}`} target="_blank" rel="noopener noreferrer" className="relative block aspect-square rounded-md overflow-hidden border border-border/50 bg-muted/20 hover:opacity-90 transition-all">
                          <Image src={`/api/support-screenshot?key=${encodeURIComponent(key)}`} alt={`Attachment ${i + 1}`} fill className="object-cover" sizes="(max-width: 640px) 50vw, 20vw" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )
          }

          // User messages (left-aligned on admin side)
          return (
            <div key={msg.id} className="flex flex-col gap-1 items-start">
              <span className="text-xs font-medium text-muted-foreground pl-[44px]">
                {userName}
              </span>
              <div className="flex items-end gap-3">
                <Avatar className="h-8 w-8 shrink-0 rounded-full">
                  <AvatarImage src={ticket.userAvatar || ""} alt={userName} className="object-cover" />
                  <AvatarFallback className="rounded-full text-xs font-semibold">
                    {getInitials(ticket.userFirstName, ticket.userLastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground max-w-[85%] sm:max-w-[75%]">
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.screenshotUrls && msg.screenshotUrls.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t pt-3 border-border/20">
                      {msg.screenshotUrls.map((key, i) => (
                        <a key={key} href={`/api/support-screenshot?key=${encodeURIComponent(key)}`} target="_blank" rel="noopener noreferrer" className="relative block aspect-square rounded-md overflow-hidden border border-border/50 bg-muted/20 hover:opacity-90 transition-all">
                          <Image src={`/api/support-screenshot?key=${encodeURIComponent(key)}`} alt={`Attachment ${i + 1}`} fill className="object-cover" sizes="(max-width: 640px) 50vw, 20vw" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono pl-[44px]">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )
        })}
      </div>

      {/* Input Area - Full Design Compliance */}
      <div className="bg-card px-4 lg:px-6 py-4 border-t shrink-0 flex flex-col gap-4 shadow-lg">
        {/* Private Note Card */}
        <div className="flex flex-col gap-1.5 bg-muted/50 border border-border rounded-lg p-3 group transition-colors focus-within:border-primary/30">
          <div className="flex items-center justify-between">
            <Label htmlFor="adminNote" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Internal Notes</Label>
            {isSaving && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
          </div>
          <input 
            id="adminNote" 
            value={adminNote} 
            onChange={(e) => setAdminNote(e.target.value)} 
            className="bg-transparent border-none text-sm w-full focus:outline-none placeholder:text-muted-foreground/40 font-medium py-1" 
            placeholder="Add internal reminders or notes..." 
            onBlur={() => executeSave({ ticketId: ticket.id, status: status as any, priority: priority as any, category: category as any, adminNote })}
          />
        </div>

        {/* Screenshot previews */}
        {screenshots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {screenshots.map((s, i) => (
              <div key={s.fileKey} className="relative group shrink-0">
                <div className="w-14 h-14 rounded-md overflow-hidden border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Local blob previews are not compatible with next/image optimization. */}
                  <img src={s.previewUrl} alt={s.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <button
                  onClick={() => removeScreenshot(i)}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5 shadow-sm hover:bg-destructive/90 transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="flex gap-4 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg text-muted-foreground h-11 w-11 shrink-0 bg-muted/30 border-border/60 hover:bg-muted/50 transition-all"
            disabled={uploading || screenshots.length >= 3}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2Icon className="h-5 w-5 animate-spin" /> : <PaperclipIcon className="h-5 w-5" />}
          </Button>
          <div className="flex-1 bg-muted/30 rounded-lg p-1 border border-border/60 shadow-inner focus-within:border-primary/40 focus-within:bg-background transition-all">
            <Textarea
              placeholder="Draft your reply..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[44px] h-11 max-h-32 border-none bg-transparent resize-none focus-visible:ring-0 text-sm leading-relaxed py-2.5 px-3"
            />
          </div>
          <Button
            className="rounded-lg h-11 px-6 shadow-xs shrink-0 font-semibold tracking-tight"
            disabled={isReplying || uploading || (!replyContent.trim() && screenshots.length === 0)}
            onClick={() => executeReply({ ticketId: ticket.id, content: replyContent, isAdminReply: true, screenshotUrls: screenshots.map(s => s.fileKey) })}
          >
            {isReplying ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <><span className="hidden sm:inline mr-2">Send Reply</span><SendIcon className="h-4 w-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  )
}
