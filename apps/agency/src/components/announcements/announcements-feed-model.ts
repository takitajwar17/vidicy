import { formatDistanceToNow } from "date-fns"
import {
  FileTextIcon,
  LayoutListIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react"
import type { AnnouncementAttachment } from "@/lib/announcements"

export type AnnouncementType =
  | "announcement"
  | "release_note"
  | "maintenance"
  | "poll"
  | "event"
  | "action_required"

export type AnnouncementPriority = "normal" | "important" | "critical"
type AnnouncementIcon = typeof MegaphoneIcon

export type PollOption = {
  id: string
  label: string
  votes: number
  hasVoted: boolean
  voters: Array<{ userId: string; name: string }>
}

export type AnnouncementComment = {
  id: string
  postId: string
  userId: string
  parentId: string | null
  body: string
  firstName: string | null
  lastName: string | null
  email: string | null
  avatar?: string | null
  role?: string | null
  createdAt?: Date | string | number | null
}

export type FeedPost = {
  id: string
  title: string
  body: string
  attachments?: AnnouncementAttachment[] | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  embedTitle?: string | null
  embedUrl?: string | null
  type: AnnouncementType
  priority: AnnouncementPriority
  pinned: boolean
  commentsEnabled: boolean
  pollSingleChoice: boolean
  pollNamedVotes: boolean
  pollAllowVoteChange: boolean
  pollCloseAt: Date | string | null
  upvotesCount: number
  hasUpvoted: boolean
  commentsCount: number
  isRead: boolean
  pollOptions: PollOption[]
  comments: AnnouncementComment[]
  authorFirstName?: string | null
  authorLastName?: string | null
  authorEmail?: string | null
  authorAvatar?: string | null
  authorRole?: string | null
  publishedAt?: Date | string | number | null
}

export type Feed = { viewerRole: string; posts: FeedPost[] }

export type AnnouncementComposerState = {
  title: string
  body: string
  type: AnnouncementType
  priority: AnnouncementPriority
  pinned: boolean
  commentsEnabled: boolean
  pollSingleChoice: boolean
  pollNamedVotes: boolean
  pollAllowVoteChange: boolean
  pollCloseAt: string
  pollOptionsText: string
  attachmentsText: string
  ctaLabel: string
  ctaUrl: string
  embedTitle: string
  embedUrl: string
  sendEmail: boolean
}

export const maxVisualDepth = 4

export const announcementTypeMeta: Record<
  AnnouncementType,
  {
    label: string
    icon: AnnouncementIcon
    badgeClassName: string
  }
> = {
  announcement: {
    label: "Announcement",
    icon: MegaphoneIcon,
    badgeClassName: "border-primary/20 bg-primary/10 text-primary",
  },
  release_note: {
    label: "Release note",
    icon: FileTextIcon,
    badgeClassName: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  maintenance: {
    label: "Maintenance",
    icon: ShieldAlertIcon,
    badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  poll: {
    label: "Poll",
    icon: LayoutListIcon,
    badgeClassName: "border-status-info/20 bg-status-info/10 text-status-info dark:text-status-info",
  },
  event: {
    label: "Event",
    icon: SparklesIcon,
    badgeClassName: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  },
  action_required: {
    label: "Action required",
    icon: MessageSquareIcon,
    badgeClassName: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
}

export const announcementPriorityMeta: Record<
  AnnouncementPriority,
  {
    label: string
    badgeClassName: string
    accentClassName: string
  }
> = {
  normal: {
    label: "Normal",
    badgeClassName: "border-border bg-background text-muted-foreground",
    accentClassName: "bg-primary/20",
  },
  important: {
    label: "Important",
    badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    accentClassName: "bg-amber-500/70",
  },
  critical: {
    label: "Critical",
    badgeClassName: "border-destructive/20 bg-destructive/10 text-destructive",
    accentClassName: "bg-destructive",
  },
}

export function createEmptyComposerState(): AnnouncementComposerState {
  return {
    title: "",
    body: "",
    type: "announcement",
    priority: "normal",
    pinned: false,
    commentsEnabled: true,
    pollSingleChoice: true,
    pollNamedVotes: true,
    pollAllowVoteChange: true,
    pollCloseAt: "",
    pollOptionsText: "",
    attachmentsText: "",
    ctaLabel: "",
    ctaUrl: "",
    embedTitle: "",
    embedUrl: "",
    sendEmail: false,
  }
}

export function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return "U"
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("")
}

export function formatRelativeTimestamp(value?: Date | string | number | null) {
  if (!value) {
    return "Just now"
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Just now"
  }

  return formatDistanceToNow(date, { addSuffix: true })
}

export function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function parseAttachmentLines(value: string): AnnouncementAttachment[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [labelPart, urlPart] = line.includes("|")
        ? line.split("|", 2).map((part) => part.trim())
        : [line, line]

      return {
        label: labelPart,
        url: urlPart,
      }
    })
}
