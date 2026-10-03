"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ExternalLinkIcon,
  FileTextIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useServerAction } from "zsa-react";
import {
  addAnnouncementCommentAction,
  createAnnouncementAction,
  deleteAnnouncementCommentAction,
  getAnnouncementsFeedAction,
  markAnnouncementReadAction,
  toggleAnnouncementUpvoteAction,
  voteOnAnnouncementPollAction,
} from "@/actions/announcement.action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  getAnnouncementActorProfile,
  buildAnnouncementDateRange,
  getAnnouncementEmbed,
  shouldShowAnnouncementPollResults,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";
import {
  announcementPriorityMeta,
  announcementTypeMeta,
  createEmptyComposerState,
  formatRelativeTimestamp,
  getHostLabel,
  getInitials,
  maxVisualDepth,
  parseAttachmentLines,
} from "./announcements-feed-model";
import type {
  AnnouncementComment,
  AnnouncementComposerState,
  AnnouncementPriority,
  AnnouncementType,
  Feed,
  FeedPost,
} from "./announcements-feed-model";

const AnnouncementMarkdown = dynamic(() =>
  import("./announcement-markdown").then((mod) => mod.AnnouncementMarkdown),
);

function RedditUpvoteIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M10 2.5 3 9.5h3.9v8h6.2v-8H17L10 2.5Z" />
    </svg>
  );
}

function AnnouncementActorAvatar({
  name,
  avatar,
  className,
  fallbackClassName,
  size,
}: {
  name: string;
  avatar?: string | null;
  className: string;
  fallbackClassName: string;
  size: number;
}) {
  return (
    <Avatar className={className}>
      {avatar ? (
        <Image
          src={avatar}
          alt={name}
          width={size}
          height={size}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <AvatarFallback className={fallbackClassName}>{getInitials(name)}</AvatarFallback>
      )}
    </Avatar>
  );
}

type CommentTreeProps = {
  comments: AnnouncementComment[];
  postId: string;
  isAdmin: boolean;
  onReply: (postId: string, body: string, parentId?: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
};

function CommentTree({ comments, postId, isAdmin, onReply, onDelete }: CommentTreeProps) {
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const commentsByParent = useMemo(() => {
    const map = new Map<string | null, AnnouncementComment[]>();

    for (const comment of comments) {
      const key = comment.parentId ?? null;
      map.set(key, [...(map.get(key) ?? []), comment]);
    }

    return map;
  }, [comments]);

  const renderNode = (parentId: string | null, depth: number) =>
    (commentsByParent.get(parentId) ?? []).map((comment) => {
      const visualDepth = Math.min(depth, maxVisualDepth);
      const actor = getAnnouncementActorProfile({
        firstName: comment.firstName,
        lastName: comment.lastName,
        email: comment.email,
        avatar: comment.avatar,
        role: comment.role,
      });
      const replyFormOpen = replyOpenFor === comment.id;
      const trimmedReplyBody = replyBody.trim();

      return (
        <div
          key={comment.id}
          className="space-y-3"
          style={visualDepth > 0 ? { marginLeft: `${visualDepth * 18}px` } : undefined}
        >
          <div
            className={cn(
              "rounded-2xl border bg-background/90 p-4 shadow-xs",
              visualDepth > 0 &&
                "relative before:absolute before:-left-[19px] before:top-6 before:h-px before:w-[19px] before:bg-border/70",
            )}
          >
            <div className="flex items-start gap-3">
              <AnnouncementActorAvatar
                name={actor.name}
                avatar={actor.avatar}
                className="h-9 w-9 border shadow-xs"
                fallbackClassName="bg-primary/10 text-xs font-semibold text-primary"
                size={36}
              />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{actor.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTimestamp(comment.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                  {comment.body}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => setReplyOpenFor(replyFormOpen ? null : comment.id)}
                  >
                    Reply
                  </Button>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-full px-3 text-xs text-destructive hover:text-destructive"
                      onClick={() => void onDelete(comment.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>

                {replyFormOpen ? (
                  <div className="space-y-2 rounded-2xl border bg-muted/20 p-3">
                    <Textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write a reply"
                      className="min-h-24 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => {
                          setReplyOpenFor(null);
                          setReplyBody("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={!trimmedReplyBody}
                        onClick={async () => {
                          await onReply(postId, trimmedReplyBody, comment.id);
                          setReplyBody("");
                          setReplyOpenFor(null);
                        }}
                      >
                        Post reply
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {renderNode(comment.id, depth + 1)}
        </div>
      );
    });

  return <div className="space-y-3">{renderNode(null, 0)}</div>;
}

function PostCard({
  post,
  isAdmin,
  onUpvote,
  onVote,
  onComment,
  onReply,
  onDeleteComment,
  onMarkRead,
}: {
  post: FeedPost;
  isAdmin: boolean;
  onUpvote: (postId: string) => void;
  onVote: (postId: string, optionIds: string[]) => void;
  onComment: (postId: string, body: string) => Promise<unknown>;
  onReply: (postId: string, body: string, parentId?: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => Promise<unknown>;
  onMarkRead: (postId: string) => void;
}) {
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [selectedPollOptionIds, setSelectedPollOptionIds] = useState(() =>
    post.pollOptions.filter((option) => option.hasVoted).map((option) => option.id),
  );

  const author = getAnnouncementActorProfile({
    firstName: post.authorFirstName,
    lastName: post.authorLastName,
    email: post.authorEmail,
    avatar: post.authorAvatar,
    role: post.authorRole,
  });
  const embed = post.embedUrl ? getAnnouncementEmbed(post.embedUrl) : null;
  const typeMeta = announcementTypeMeta[post.type];
  const priorityMeta = announcementPriorityMeta[post.priority];
  const hasVoted = post.pollOptions.some((option) => option.hasVoted);
  const shouldShowResults = shouldShowAnnouncementPollResults({
    hasVoted,
    pollCloseAt: post.pollCloseAt,
  });
  const totalVotes = post.pollOptions.reduce((sum, option) => sum + option.votes, 0);
  const trimmedCommentText = commentText.trim();
  const pollVotingLocked = hasVoted && !post.pollAllowVoteChange;
  const showDiscussionEmptyState = post.comments.length === 0 && !commentComposerOpen;

  const markReadIfNeeded = () => {
    if (!post.isRead) {
      void onMarkRead(post.id);
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60 shadow-sm transition-colors",
        !post.isRead && "border-primary/35 shadow-primary/5",
      )}
      onFocusCapture={markReadIfNeeded}
    >
      <div className={cn("h-1 w-full", priorityMeta.accentClassName)} />
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start gap-4">
          <AnnouncementActorAvatar
            name={author.name}
            avatar={author.avatar}
            className="h-12 w-12 border shadow-xs"
            fallbackClassName="bg-primary/10 font-semibold text-primary"
            size={48}
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{author.name}</p>
                  <Badge variant="outline" className={cn("gap-1 rounded-full px-3", typeMeta.badgeClassName)}>
                    <typeMeta.icon className="h-3.5 w-3.5" />
                    {typeMeta.label}
                  </Badge>
                  {post.pinned ? (
                    <Badge variant="secondary" className="rounded-full px-3">
                      Pinned
                    </Badge>
                  ) : null}
                  {post.priority !== "normal" ? (
                    <Badge
                      variant="outline"
                      className={cn("rounded-full px-3", priorityMeta.badgeClassName)}
                    >
                      {priorityMeta.label}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelativeTimestamp(post.publishedAt)}</span>
                  {author.email ? (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="truncate">{author.email}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!post.isRead ? (
                  <Badge className="rounded-full px-3">Unread</Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full px-3">
                    Seen
                  </Badge>
                )}
                {!post.isRead ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 rounded-full px-4"
                    onClick={() => void onMarkRead(post.id)}
                  >
                    Mark as read
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">{post.title}</h3>
              <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:scroll-m-20 prose-p:leading-7 prose-a:text-primary">
                <AnnouncementMarkdown>{post.body}</AnnouncementMarkdown>
              </div>
            </div>
          </div>
        </div>

        {post.attachments?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {post.attachments.map((attachment) => (
              <a
                key={`${post.id}-${attachment.url}`}
                className="group flex items-center gap-3 rounded-2xl border bg-background/80 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
                href={attachment.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <PaperclipIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{getHostLabel(attachment.url)}</p>
                </div>
                <ExternalLinkIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </a>
            ))}
          </div>
        ) : null}

        {embed ? (
          <div className="overflow-hidden rounded-2xl border bg-background/80">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
              <FileTextIcon className="h-4 w-4 text-primary" />
              <span>{post.embedTitle || "Embedded content"}</span>
            </div>
            <iframe
              className="aspect-video w-full"
              src={embed.src}
              title={post.embedTitle || post.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : null}

        {post.type === "poll" ? (
          <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Poll</p>
                <p className="text-xs text-muted-foreground">
                  {post.pollSingleChoice ? "Choose one option" : "Choose one or more options"}
                  {post.pollAllowVoteChange ? " · vote changes allowed" : " · final vote only"}
                </p>
              </div>
              {post.pollCloseAt ? (
                <Badge variant="outline" className="w-fit rounded-full px-3">
                  Closes {formatRelativeTimestamp(post.pollCloseAt)}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-2">
              {post.pollOptions.map((option) => {
                const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                const isSelected = selectedPollOptionIds.includes(option.id);

                return (
                  <div
                    key={option.id}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border bg-background/90",
                      (option.hasVoted || isSelected) && "border-primary/35",
                    )}
                  >
                    {shouldShowResults ? (
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/10"
                        style={{ width: `${Math.max(percent, option.hasVoted ? 8 : 0)}%` }}
                      />
                    ) : null}

                    <div className="relative flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        {post.pollSingleChoice ? (
                          <div className="space-y-1">
                            <p className="font-medium">{option.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {shouldShowResults
                                ? `${percent}% of votes`
                                : option.hasVoted
                                  ? "You already voted"
                                  : "Vote to unlock results"}
                            </p>
                          </div>
                        ) : (
                          <label className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              disabled={pollVotingLocked}
                              onCheckedChange={(checked) => {
                                setSelectedPollOptionIds((prev) =>
                                  checked
                                    ? [...new Set([...prev, option.id])]
                                    : prev.filter((id) => id !== option.id),
                                );
                              }}
                            />
                            <div className="space-y-1">
                              <p className="font-medium">{option.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {shouldShowResults
                                  ? `${percent}% of votes`
                                  : option.hasVoted
                                    ? "You already voted"
                                    : "Select to vote"}
                              </p>
                            </div>
                          </label>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {shouldShowResults ? (
                          <span className="text-xs font-medium text-muted-foreground">
                            {option.votes} vote{option.votes === 1 ? "" : "s"}
                          </span>
                        ) : null}

                        {post.pollSingleChoice ? (
                          <Button
                            size="sm"
                            variant={option.hasVoted ? "default" : "outline"}
                            className="rounded-full px-4"
                            disabled={pollVotingLocked}
                            onClick={() => void onVote(post.id, [option.id])}
                          >
                            {option.hasVoted
                              ? post.pollAllowVoteChange
                                ? "Change vote"
                                : "Voted"
                              : "Vote"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!post.pollSingleChoice ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full px-4"
                disabled={selectedPollOptionIds.length === 0 || pollVotingLocked}
                onClick={() => void onVote(post.id, selectedPollOptionIds)}
              >
                {hasVoted && post.pollAllowVoteChange ? "Update vote" : "Submit vote"}
              </Button>
            ) : null}

            {pollVotingLocked ? (
              <p className="text-xs text-muted-foreground">
                Vote changes are disabled for this poll.
              </p>
            ) : null}

            {post.pollNamedVotes && shouldShowResults ? (
              <div className="rounded-2xl border bg-background/80 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Named votes
                </p>
                <div className="space-y-2 text-sm">
                  {post.pollOptions.map((option) => (
                    <div key={`${option.id}-voters`} className="space-y-1">
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.voters.length > 0
                          ? option.voters.map((voter) => voter.name).join(", ")
                          : "No votes yet"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/20 p-2">
          <Button
            size="sm"
            type="button"
            variant={post.hasUpvoted ? "default" : "outline"}
            className="gap-1.5 rounded-full px-3"
            aria-label={post.hasUpvoted ? "Remove upvote" : "Upvote"}
            aria-pressed={post.hasUpvoted}
            onClick={() => void onUpvote(post.id)}
          >
            <RedditUpvoteIcon className="h-4 w-4" />
            <span className="min-w-4 text-center text-sm font-medium tabular-nums">
              {post.upvotesCount}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full px-4"
            onClick={() => setCommentComposerOpen((open) => !open)}
          >
            <MessageSquareIcon className="mr-2 h-4 w-4" />
            Comment
          </Button>
          <Badge variant="secondary" className="rounded-full px-3">
            {post.commentsCount} repl{post.commentsCount === 1 ? "y" : "ies"}
          </Badge>
          {post.ctaUrl && post.ctaLabel ? (
            <Button size="sm" variant="secondary" className="rounded-full px-4 sm:ml-auto" asChild>
              <a href={post.ctaUrl} target="_blank" rel="noreferrer noopener">
                {post.ctaLabel}
                <ExternalLinkIcon className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>

        <Separator />

        {post.commentsEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Discussion</p>
                <p className="text-sm text-muted-foreground">
                  Ask questions, react, or add context to this update.
                </p>
              </div>
              <Badge variant="outline" className="rounded-full px-3">
                {post.commentsCount} comment{post.commentsCount === 1 ? "" : "s"}
              </Badge>
            </div>

            {commentComposerOpen ? (
              <div className="space-y-3 rounded-2xl border bg-muted/20 p-3">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your feedback, ask a question, or add more context"
                  className="min-h-24 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-4"
                    onClick={() => {
                      setCommentComposerOpen(false);
                      setCommentText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full px-4"
                    disabled={!trimmedCommentText}
                    onClick={async () => {
                      await onComment(post.id, trimmedCommentText);
                      setCommentText("");
                      setCommentComposerOpen(false);
                    }}
                  >
                    Post comment
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-2xl border border-dashed bg-background/70 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                onClick={() => setCommentComposerOpen(true)}
              >
                Join the conversation
              </button>
            )}

            {post.comments.length > 0 ? (
              <CommentTree
                comments={post.comments}
                postId={post.id}
                isAdmin={isAdmin}
                onDelete={onDeleteComment}
                onReply={onReply}
              />
            ) : showDiscussionEmptyState ? (
              <div className="rounded-2xl border border-dashed bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                No comments yet. Start the thread.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-background/60 px-4 py-5 text-sm text-muted-foreground">
            Comments are disabled for this update.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnnouncementsFeedClient({
  initialFeed,
  isAdmin,
}: {
  initialFeed: Feed;
  isAdmin: boolean;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [composerOpen, setComposerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<AnnouncementType | "all">("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [newPost, setNewPost] = useState<AnnouncementComposerState>(createEmptyComposerState);

  const { execute: refreshFeed } = useServerAction(getAnnouncementsFeedAction, {
    onSuccess({ data }) {
      if (data) {
        setFeed(data as Feed);
      }
    },
  });

  const publishPollOptions = useMemo(
    () =>
      newPost.pollOptionsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [newPost.pollOptionsText],
  );

  const canPublish =
    newPost.title.trim().length >= 3 &&
    newPost.body.trim().length >= 3 &&
    (newPost.type !== "poll" || publishPollOptions.length >= 2);

  const spotlightPosts = useMemo(
    () => feed.posts.filter((post) => post.pinned || post.priority === "critical").slice(0, 3),
    [feed.posts],
  );

  const composerTypeMeta = announcementTypeMeta[newPost.type];
  const composerPriorityMeta = announcementPriorityMeta[newPost.priority];

  const refresh = (overrides?: {
    q?: string;
    type?: AnnouncementType | "all";
    pinnedOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const resolvedType = overrides?.type ?? filterType;
    const resolvedDates = buildAnnouncementDateRange({
      dateFrom: overrides?.dateFrom ?? dateFrom,
      dateTo: overrides?.dateTo ?? dateTo,
    });

    return refreshFeed({
      q: overrides?.q ?? (search || undefined),
      type: resolvedType === "all" ? undefined : resolvedType,
      pinnedOnly: overrides?.pinnedOnly ?? pinnedOnly,
      dateFrom: resolvedDates.dateFrom,
      dateTo: resolvedDates.dateTo,
    });
  };

  const resetComposer = () => {
    setNewPost(createEmptyComposerState());
  };

  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setPinnedOnly(false);
    setDateFrom("");
    setDateTo("");
    void refresh({
      q: undefined,
      type: "all",
      pinnedOnly: false,
      dateFrom: "",
      dateTo: "",
    });
  };

  const { execute: createPost, isPending: creating } = useServerAction(createAnnouncementAction, {
    onSuccess() {
      toast.success("Announcement published");
      setComposerOpen(false);
      resetComposer();
      void refresh();
    },
    onError({ err }) {
      toast.error(err.message || "Failed to publish announcement");
    },
  });

  const { execute: toggleUpvote } = useServerAction(toggleAnnouncementUpvoteAction, {
    onSuccess() {
      void refresh();
    },
  });

  const { execute: addComment } = useServerAction(addAnnouncementCommentAction, {
    onSuccess() {
      void refresh();
    },
  });

  const { execute: votePoll } = useServerAction(voteOnAnnouncementPollAction, {
    onSuccess() {
      void refresh();
    },
    onError({ err }) {
      toast.error(err.message || "Failed to submit vote");
    },
  });

  const { execute: markRead } = useServerAction(markAnnouncementReadAction, {
    onSuccess() {
      void refresh();
    },
  });

  const { execute: deleteComment } = useServerAction(deleteAnnouncementCommentAction, {
    onSuccess() {
      void refresh();
    },
  });

  return (
    <Sheet open={composerOpen} onOpenChange={setComposerOpen}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          {feed.posts.length > 0 ? (
            feed.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isAdmin={isAdmin}
                onUpvote={(postId: string) => toggleUpvote({ postId })}
                onVote={(postId: string, optionIds: string[]) => votePoll({ postId, optionIds })}
                onComment={(postId: string, body: string) => addComment({ postId, body })}
                onReply={(postId: string, body: string, parentId?: string) =>
                  addComment({ postId, body, parentId })
                }
                onDeleteComment={(commentId: string) => deleteComment({ commentId })}
                onMarkRead={(postId: string) => markRead({ postId })}
              />
            ))
          ) : (
            <Card className="border-dashed border-border/70">
              <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <MegaphoneIcon className="h-10 w-10 text-primary" />
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">No updates match those filters</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Try broadening the filters or clear them to bring the full feed back.
                  </p>
                </div>
                <Button variant="outline" className="rounded-full px-5" onClick={clearFilters}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <CardDescription>Find what matters fast</CardDescription>
              <CardTitle className="text-lg">Filter feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search title or body"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void refresh();
                    }
                  }}
                />
              </div>

              <Select
                value={filterType}
                onValueChange={(value) => setFilterType(value as AnnouncementType | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                  <SelectItem value="release_note">Release note</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="poll">Poll</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="action_required">Action required</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    From
                  </Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    To
                  </Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                <Checkbox checked={pinnedOnly} onCheckedChange={(v) => setPinnedOnly(Boolean(v))} />
                Pinned only
              </label>

              <div className="flex flex-wrap gap-2">
                <Button className="rounded-full px-5" onClick={() => void refresh()}>
                  Apply filters
                </Button>
                <Button variant="outline" className="rounded-full px-5" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {spotlightPosts.length > 0 ? (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardDescription>High-visibility posts</CardDescription>
                <CardTitle className="text-lg">Spotlight</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {spotlightPosts.map((post, index) => {
                  const meta = announcementTypeMeta[post.type];
                  return (
                    <div key={post.id} className="space-y-3">
                      {index > 0 ? <Separator /> : null}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("gap-1 rounded-full px-3", meta.badgeClassName)}>
                            <meta.icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </Badge>
                          {post.pinned ? (
                            <Badge variant="secondary" className="rounded-full px-3">
                              Pinned
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium leading-6">{post.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTimestamp(post.publishedAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardDescription>What makes the feed feel useful</CardDescription>
                <CardTitle className="text-lg">Posting guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SheetTrigger asChild>
                  <Button className="w-full rounded-full">
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create update
                  </Button>
                </SheetTrigger>
                {(
                  [
                    ["Lead with the outcome", "Use the title like a headline and the first paragraph like the executive summary."],
                    ["Keep actions explicit", "Use action-required posts when the reader needs to do something after reading."],
                    ["Use rich content sparingly", "Attachments, embeds, and CTAs should add clarity, not visual noise."],
                  ] as const
                ).map(([title, body]) => (
                  <div key={title} className="rounded-2xl border bg-background/70 p-3">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("gap-1 rounded-full px-3", composerTypeMeta.badgeClassName)}
            >
              <composerTypeMeta.icon className="h-3.5 w-3.5" />
              {composerTypeMeta.label}
            </Badge>
            {newPost.priority !== "normal" ? (
              <Badge
                variant="outline"
                className={cn("rounded-full px-3", composerPriorityMeta.badgeClassName)}
              >
                {composerPriorityMeta.label}
              </Badge>
            ) : null}
            {newPost.pinned ? (
              <Badge variant="secondary" className="rounded-full px-3">
                Pinned
              </Badge>
            ) : null}
          </div>
          <SheetTitle>Publish announcement</SheetTitle>
          <SheetDescription>
            Create a cleaner, more social-style update without leaving the feed.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-11.5rem)]">
          <div className="space-y-6 px-6 py-6">
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4">
                <CardDescription>Core message</CardDescription>
                <CardTitle className="text-lg">Post details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    placeholder="Write a headline that helps people decide to open the post"
                    value={newPost.title}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    placeholder="Body copy supports markdown, so use headings, bullets, and links when they make the post easier to scan."
                    className="min-h-48"
                    value={newPost.body}
                    onChange={(e) => setNewPost((prev) => ({ ...prev, body: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={newPost.type}
                      onValueChange={(value) =>
                        setNewPost((prev) => ({ ...prev, type: value as AnnouncementType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="release_note">Release note</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="poll">Poll</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="action_required">Action required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={newPost.priority}
                      onValueChange={(value) =>
                        setNewPost((prev) => ({
                          ...prev,
                          priority: value as AnnouncementPriority,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="important">Important</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4">
                <CardDescription>Attachments, embeds, and quick actions</CardDescription>
                <CardTitle className="text-lg">Rich content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Attachments</Label>
                  <Textarea
                    placeholder="One per line: Label | https://example.com/file.pdf"
                    value={newPost.attachmentsText}
                    onChange={(e) =>
                      setNewPost((prev) => ({ ...prev, attachmentsText: e.target.value }))
                    }
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>CTA label</Label>
                    <Input
                      placeholder="Open checklist"
                      value={newPost.ctaLabel}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, ctaLabel: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CTA URL</Label>
                    <Input
                      placeholder="https://..."
                      value={newPost.ctaUrl}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, ctaUrl: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Embed title</Label>
                    <Input
                      placeholder="Walkthrough video"
                      value={newPost.embedTitle}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, embedTitle: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embed URL</Label>
                    <Input
                      placeholder="YouTube, Loom, Vimeo, Google Docs, or Drive"
                      value={newPost.embedUrl}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, embedUrl: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {newPost.type === "poll" ? (
              <Card className="border-border/60 shadow-none">
                <CardHeader className="pb-4">
                  <CardDescription>Voting rules and answer options</CardDescription>
                  <CardTitle className="text-lg">Poll settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Options</Label>
                    <Textarea
                      placeholder="One option per line"
                      value={newPost.pollOptionsText}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, pollOptionsText: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Close date</Label>
                    <Input
                      type="datetime-local"
                      value={newPost.pollCloseAt}
                      onChange={(e) =>
                        setNewPost((prev) => ({ ...prev, pollCloseAt: e.target.value }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                      <Checkbox
                        checked={newPost.pollSingleChoice}
                        onCheckedChange={(value) =>
                          setNewPost((prev) => ({
                            ...prev,
                            pollSingleChoice: Boolean(value),
                          }))
                        }
                      />
                      Single choice
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                      <Checkbox
                        checked={newPost.pollNamedVotes}
                        onCheckedChange={(value) =>
                          setNewPost((prev) => ({
                            ...prev,
                            pollNamedVotes: Boolean(value),
                          }))
                        }
                      />
                      Named votes
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm sm:col-span-2">
                      <Checkbox
                        checked={newPost.pollAllowVoteChange}
                        onCheckedChange={(value) =>
                          setNewPost((prev) => ({
                            ...prev,
                            pollAllowVoteChange: Boolean(value),
                          }))
                        }
                      />
                      Allow vote changes after the first submission
                    </label>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4">
                <CardDescription>How the post behaves in the feed</CardDescription>
                <CardTitle className="text-lg">Visibility and delivery</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                  <Checkbox
                    checked={newPost.pinned}
                    onCheckedChange={(value) =>
                      setNewPost((prev) => ({ ...prev, pinned: Boolean(value) }))
                    }
                  />
                  Pinned in the feed
                </label>
                <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                  <Checkbox
                    checked={newPost.commentsEnabled}
                    onCheckedChange={(value) =>
                      setNewPost((prev) => ({ ...prev, commentsEnabled: Boolean(value) }))
                    }
                  />
                  Comments enabled
                </label>
                <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm sm:col-span-2">
                  <Checkbox
                    checked={newPost.sendEmail}
                    onCheckedChange={(value) =>
                      setNewPost((prev) => ({ ...prev, sendEmail: Boolean(value) }))
                    }
                  />
                  Send email notification to verified users
                </label>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Posts appear in the feed immediately after publish.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                className="rounded-full px-5"
                onClick={() => {
                  resetComposer();
                  setComposerOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full px-5"
                disabled={creating || !canPublish}
                onClick={() =>
                  void createPost({
                    title: newPost.title,
                    body: newPost.body,
                    type: newPost.type,
                    priority: newPost.priority,
                    pinned: newPost.pinned,
                    commentsEnabled: newPost.commentsEnabled,
                    pollSingleChoice: newPost.pollSingleChoice,
                    pollNamedVotes: newPost.pollNamedVotes,
                    pollAllowVoteChange: newPost.pollAllowVoteChange,
                    pollCloseAt: newPost.pollCloseAt ? new Date(newPost.pollCloseAt) : null,
                    pollOptions: newPost.type === "poll" ? publishPollOptions : [],
                    attachments: parseAttachmentLines(newPost.attachmentsText),
                    cta:
                      newPost.ctaLabel.trim() && newPost.ctaUrl.trim()
                        ? {
                            label: newPost.ctaLabel.trim(),
                            url: newPost.ctaUrl.trim(),
                          }
                        : null,
                    embed: newPost.embedUrl.trim()
                      ? {
                          title: newPost.embedTitle.trim() || null,
                          url: newPost.embedUrl.trim(),
                        }
                      : null,
                    sendEmail: newPost.sendEmail,
                  })
                }
              >
                Publish
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
