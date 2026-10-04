"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronLeftIcon, SendIcon, PaperclipIcon, Loader2Icon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useServerAction } from "zsa-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { addSupportMessageAction, markTicketAsViewedAction } from "@/actions/support.action"
import type { SupportTicket, SupportMessage } from "@/db/schema"

const MAX_SCREENSHOTS = 3
import { MAX_SUPPORT_FILE_SIZE } from "@/constants"

interface UploadedScreenshot {
  fileKey: string
  previewUrl: string
  name: string
}

interface UserTicketDetailProps {
  ticket: SupportTicket & { messages: SupportMessage[] }
  onBack?: () => void
  backHref?: string
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "open":
      return "bg-status-info/10 text-status-info border-status-info/20"
    case "in_progress":
      return "bg-status-warning/10 text-status-warning border-status-warning/20"
    case "resolved":
      return "bg-status-success/10 text-status-success border-status-success/20"
    case "closed":
      return "bg-status-neutral/10 text-status-neutral border-status-neutral/20"
    default:
      return "bg-status-neutral/10 text-status-neutral border-status-neutral/20"
  }
}

function ScreenshotThumbnails({ urls }: { urls: string[] | null | undefined }) {
  if (!urls || urls.length === 0) return null

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 border-current/10">
      {urls.map((key, i) => (
        <a
          key={key}
          href={`/api/support-screenshot?key=${encodeURIComponent(key)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-square rounded-md overflow-hidden border border-border/50 bg-muted/20 hover:opacity-80 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated support screenshots are served from an API route and should not be optimized/cached. */}
          <img
            src={`/api/support-screenshot?key=${encodeURIComponent(key)}`}
            alt={`Attachment ${i + 1}`}
            className="w-full h-full object-cover"
          />
        </a>
      ))}
    </div>
  )
}

export function UserTicketDetail({ ticket, onBack, backHref }: UserTicketDetailProps) {
  const [replyContent, setReplyContent] = useState("")
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { execute: executeReply, isPending: isReplying } = useServerAction(addSupportMessageAction, {
    onSuccess: () => {
      setReplyContent("")
      // Revoke object URLs to free memory
      screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl))
      setScreenshots([])
      router.refresh()
    },
    onError: (err) => {
      toast.error(err.err.message || "Failed to send reply")
    },
  })

  const { execute: executeMarkViewed } = useServerAction(markTicketAsViewedAction)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [ticket.messages])

  // Fire-and-forget: mark ticket as viewed on mount
  useEffect(() => {
    executeMarkViewed({ ticketId: ticket.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset state when ticket changes
  useEffect(() => {
    setReplyContent("")
    screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    setScreenshots([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    // Reset input so same file can be re-selected
    e.target.value = ""

    const available = MAX_SCREENSHOTS - screenshots.length
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
        const json = (await res.json()) as { success?: boolean; fileKey?: string; error?: string }

        if (!res.ok || !json.fileKey) {
          toast.error(json.error || `Failed to upload "${file.name}"`)
          continue
        }

        setScreenshots((prev) => [
          ...prev,
          {
            fileKey: json.fileKey!,
            previewUrl: URL.createObjectURL(file),
            name: file.name,
          },
        ])
      } catch {
        toast.error(`Failed to upload "${file.name}"`)
      } finally {
        setUploading(false)
      }
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handleSend() {
    executeReply({
      ticketId: ticket.id,
      content: replyContent,
      screenshotUrls: screenshots.map((s) => s.fileKey),
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (isReplying || uploading || (!replyContent.trim() && screenshots.length === 0)) return
      handleSend()
    }
  }

  // Messages are already fetched in ascending order (asc createdAt) from the server
  const sortedMessages = ticket.messages

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 lg:px-6 bg-card border-b flex items-center gap-3 shrink-0 z-10">
        {backHref ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" asChild>
            <Link href={backHref as any} aria-label="Back to tickets">
              <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={onBack} aria-label="Back to tickets">
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
        )}

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{ticket.subject}</span>
          <span className="font-mono text-xs text-muted-foreground shrink-0">
            #{ticket.id.slice(-6)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "capitalize text-xs px-2 py-0.5 font-semibold",
              getStatusBadgeClass(ticket.status)
            )}
          >
            {ticket.status.replace("_", " ")}
          </Badge>
          <Badge variant="outline" className="hidden sm:inline-flex capitalize text-xs px-2 py-0.5 font-semibold">
            {ticket.category.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50"
        ref={scrollRef}
      >
        {/* Thread start divider */}
        <div className="flex justify-center">
          <div className="bg-muted/50 text-xs text-muted-foreground px-4 py-1 rounded-md font-medium tracking-wider border border-border/20">
            Ticket opened · {new Date(ticket.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Original request bubble (right-aligned, user) */}
        <div className="flex flex-col gap-1 items-end">
          <span className="text-xs font-medium text-muted-foreground">
            You
          </span>
          <div className="rounded-xl px-4 py-2.5 text-sm bg-primary text-primary-foreground max-w-[85%] sm:max-w-[75%]">
            <p className="leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
            <ScreenshotThumbnails urls={ticket.screenshotUrls} />
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {new Date(ticket.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Thread messages */}
        {sortedMessages.map((msg) => {
          // System messages
          if (msg.isSystemMessage) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-muted/50 text-xs text-muted-foreground px-3 py-1 rounded-md font-medium tracking-wider border border-border/10">
                  {msg.content} · {new Date(msg.createdAt).toLocaleDateString()}
                </div>
              </div>
            )
          }

          // User messages (right-aligned, no avatar)
          if (!msg.isAdminReply) {
            return (
              <div key={msg.id} className="flex flex-col gap-1 items-end">
                <span className="text-xs font-medium text-muted-foreground">
                  You
                </span>
                <div className="rounded-xl px-4 py-2.5 text-sm bg-primary text-primary-foreground max-w-[85%] sm:max-w-[75%]">
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <ScreenshotThumbnails urls={msg.screenshotUrls} />
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )
          }

          // Admin messages stay left-aligned to separate support replies from user replies.
          const adminUser = (msg as any).user as { firstName?: string | null; lastName?: string | null } | undefined
          const adminInitials = adminUser
            ? `${adminUser.firstName?.[0] ?? ""}${adminUser.lastName?.[0] ?? ""}`.toUpperCase() || "ST"
            : "ST"
          const adminName = adminUser
            ? [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") || "Support Team"
            : "Support Team"

          return (
            <div key={msg.id} className="flex flex-col gap-1 items-start">
              <span className="text-xs font-medium text-muted-foreground pl-[44px]">
                {adminName}
              </span>
              <div className="flex items-end gap-3">
                <Avatar className="h-8 w-8 shrink-0 rounded-full">
                  <AvatarImage src="/founder-avatar.jpeg" alt={adminName} className="object-cover" />
                  <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {adminInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground max-w-[85%] sm:max-w-[75%]">
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <ScreenshotThumbnails urls={msg.screenshotUrls} />
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono pl-[44px]">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )
        })}
      </div>

      {/* Input Area */}
      <div className="bg-card px-4 lg:px-6 py-4 border-t shrink-0">
        {ticket.status === "closed" ? (
          <div className="py-3 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              This ticket has been closed.
            </p>
          </div>
        ) : (
          <>
            {/* Screenshot previews */}
            {screenshots.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto">
                {screenshots.map((s, i) => (
                  <div key={s.fileKey} className="relative group shrink-0">
                    <div className="w-12 h-12 rounded-md overflow-hidden border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Local blob previews are not compatible with next/image optimization. */}
                      <img src={s.previewUrl} alt={s.name} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeScreenshot(i)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5 shadow-sm"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div className="flex gap-3 items-end">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Paperclip button */}
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg shrink-0 border-border/60"
                disabled={uploading || screenshots.length >= MAX_SCREENSHOTS}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <PaperclipIcon className="h-4 w-4" />
                )}
              </Button>

              {/* Textarea */}
              <div className="flex-1 bg-muted/30 rounded-xl border border-border/60 shadow-inner focus-within:border-primary/40 focus-within:bg-background transition-all px-1">
                <Textarea
                  placeholder="Add the case, file, or screen where this happens..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[40px] h-10 max-h-28 border-none bg-transparent resize-none focus-visible:ring-0 text-sm py-2.5 px-3"
                />
              </div>

              {/* Send button */}
              <Button
                className="h-10 w-10 rounded-full shadow-xs shrink-0"
                size="icon"
                disabled={
                  isReplying || uploading || (!replyContent.trim() && screenshots.length === 0)
                }
                onClick={handleSend}
              >
                {isReplying ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SendIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
