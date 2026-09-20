"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SendIcon,
  Loader2Icon,
  PaperclipIcon,
  FileTextIcon,
  XIcon,
  PlusIcon,
  Trash2Icon,
  HistoryIcon,
} from "lucide-react";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  createConversationAction,
  listConversationsAction,
  deleteConversationAction,
  getConversationMessagesAction,
} from "@/actions/chat.action";
import { useSessionStore } from "@/state/session";
import { getInitials } from "@/utils/name-initials";
import type { ChatMessage, ChatConversation } from "@/db/schema";
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
} from "@/components/ui/alert-dialog";

function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

const ALL_CHAT_SUGGESTIONS = [
  "How strong is my application?",
  "What documents am I still missing?",
  "What are my biggest risks?",
  "What do visa officers look for?",
  "How can I improve my chances?",
  "What should I expect at the embassy?",
  "Am I likely to get approved?",
  "What's the biggest gap in my file?",
  "How does my profile compare to typical approvals?",
  "What should I do before my appointment?",
  "Are my financial documents strong enough?",
  "What ties to home country should I show?",
] as const;

interface VisaChatProps {
  applicationId: string;
  initialMessages: ChatMessage[];
  conversations?: ChatConversation[];
  activeConversationId?: string;
  currentUser?: {
    name: string;
    avatar: string;
    initials: string;
  };
  fullScreen?: boolean;
}

interface ChatStreamDeltaEvent {
  type: "delta";
  delta: string;
}

interface ChatStreamDoneEvent {
  type: "done";
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  model: string;
}

interface ChatStreamErrorEvent {
  type: "error";
  message: string;
}

type ChatStreamEvent =
  | ChatStreamDeltaEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;

/**
 * Normalizes assistant text so inline numbered sequences render as markdown lists.
 */
function normalizeMarkdownForDisplay(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\s(?=\d+\.\s+\*\*)/g, "\n")
    .replace(/\s(?=\d+\.\s+[A-Za-z])/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parses a user message that may contain an attached PDF.
 * Handles formats:
 *   "📄 **filename.pdf**"
 *   "📄 **filename.pdf**\n\nsome text"
 *   "📄 **filename.pdf** *(could not extract text)*"
 */
function parsePdfMessage(content: string): {
  filename: string | null;
  text: string;
} {
  const match = content.match(
    /^📄 \*\*(.+?)\*\*(?:\s+\*\([^)]*\)\*)?(?:\n\n([\s\S]*))?$/,
  );
  if (!match) return { filename: null, text: content };
  return { filename: match[1], text: (match[2] ?? "").trim() };
}

/**
 * Renders the first page of a PDF File to a JPEG data URL for use as a thumbnail.
 * Uses pdfjs-dist (already in the project) with a CDN worker URL.
 */
async function generatePdfThumbnail(file: File): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    // Use jsDelivr CDN for the worker — avoids webpack/bundle complexity
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
      .promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    // Scale so the thumbnail is ~280px wide
    const scale = 280 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas })
      .promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

export function VisaChat({
  applicationId,
  initialMessages,
  conversations: initialConversations = [],
  activeConversationId: initialActiveConversationId,
  currentUser,
  fullScreen = false,
}: VisaChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null);
  const [attachedPdfThumbnail, setAttachedPdfThumbnail] = useState<
    string | null
  >(null);
  const [streamingHasBegun, setStreamingHasBegun] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(initialActiveConversationId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchingConversation, setSwitchingConversation] = useState(false);

  // Pick 4 random suggestions once per mount
  const suggestions = useMemo(() => {
    const shuffled = [...ALL_CHAT_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, []);
  // Keyed by message ID — holds thumbnails for PDFs. Pre-seeded from persisted data on load.
  const [pdfThumbnails, setPdfThumbnails] = useState<Map<string, string>>(
    () => {
      const map = new Map<string, string>();
      for (const msg of initialMessages) {
        if (msg.thumbnailDataUrl) map.set(msg.id, msg.thumbnailDataUrl);
      }
      return map;
    },
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasStreamingAssistantPlaceholder = useMemo(
    () => messages.some((msg) => msg.id.startsWith("temp-assistant-")),
    [messages],
  );

  /** Pull user identity from the global session store — same source as the app sidebar avatar. */
  const sessionUser = useSessionStore((s) => s.session?.user);
  const fallbackUserAvatar = sessionUser?.avatar ?? "";
  /** Construct a display name from firstName/lastName, matching the same logic used in SiteSidebar. */
  const fallbackUserName =
    `${sessionUser?.firstName ?? ""} ${sessionUser?.lastName ?? ""}`.trim() ||
    sessionUser?.email ||
    "User";
  const userName = currentUser?.name ?? fallbackUserName;
  const userAvatar = currentUser?.avatar ?? fallbackUserAvatar;
  const userInitials = currentUser?.initials ?? (getInitials(userName) || "U");

  // Keep local state aligned when server data refreshes after navigation/actions.
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    setActiveConversationId(initialActiveConversationId);
  }, [initialActiveConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Lock body scroll when history panel is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [sidebarOpen]);

  // Conversation management
  const handleNewChat = useCallback(async () => {
    // Don't create another chat if the current one has no messages
    if (messages.length === 0) return;

    try {
      setSwitchingConversation(true);
      const [result, err] = await createConversationAction({ applicationId });
      if (err) {
        toast.error("Failed to create conversation");
        return;
      }
      setConversations((prev) => [result, ...prev]);
      setActiveConversationId(result.id);
      setMessages([]);
    } catch {
      toast.error("Failed to create conversation");
    } finally {
      setSwitchingConversation(false);
    }
  }, [applicationId, messages.length]);

  const handleSwitchConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationId) {
      setSidebarOpen(false);
      return;
    }
    try {
      setSwitchingConversation(true);
      setActiveConversationId(conversationId);
      const [result, err] = await getConversationMessagesAction({
        applicationId,
        conversationId,
      });
      if (err) {
        toast.error("Failed to load messages");
        return;
      }
      setMessages(result ?? []);
      setSidebarOpen(false);
    } catch {
      toast.error("Failed to switch conversation");
    } finally {
      setSwitchingConversation(false);
    }
  }, [activeConversationId, applicationId]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      const [, err] = await deleteConversationAction({ conversationId });
      if (err) {
        toast.error("Failed to delete conversation");
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      // If we deleted the active conversation, switch to the next one or create new
      if (conversationId === activeConversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id);
          setMessages([]);
        } else {
          handleNewChat();
        }
      }
    } catch {
      toast.error("Failed to delete conversation");
    }
  }, [activeConversationId, conversations, handleNewChat]);

  async function handleSend() {
    const text = input.trim();
    if ((!text && !attachedPdf) || loading || !activeConversationId) return;

    setInput("");
    setLoading(true);

    if (attachedPdf) {
      // PDF + optional text → send to chat-with-pdf endpoint for immediate response
      const pdf = attachedPdf;
      const thumbnail = attachedPdfThumbnail;
      setAttachedPdf(null);
      setAttachedPdfThumbnail(null);

      const userContent = `📄 **${pdf.name}**${text ? `\n\n${text}` : ""}`;
      const tempId = `temp-${Date.now()}`;
      const tempUserMsg: ChatMessage = {
        id: tempId,
        conversationId: activeConversationId,
        applicationId,
        role: "user",
        content: userContent,
        thumbnailDataUrl: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      // Store thumbnail for the temp message so preview shows instantly
      if (thumbnail) {
        setPdfThumbnails((prev) => new Map(prev).set(tempId, thumbnail));
      }

      const formData = new FormData();
      formData.append("file", pdf);
      formData.append("applicationId", applicationId);
      formData.append("conversationId", activeConversationId);
      if (text) formData.append("message", text);
      if (thumbnail) formData.append("thumbnail", thumbnail);

      try {
        const res = await fetch("/api/chat-with-pdf", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as {
          userMessage?: ChatMessage;
          assistantMessage?: ChatMessage;
          error?: string;
        };
        if (!res.ok || !data.userMessage || !data.assistantMessage)
          throw new Error(data.error || "Failed");

        // Use the thumbnail that was persisted server-side (travels back via userMessage.thumbnailDataUrl)
        // so future page loads can restore it from initialMessages without re-generation.
        setPdfThumbnails((prev) => {
          const next = new Map(prev);
          next.delete(tempId);
          const persistedThumbnail =
            data.userMessage?.thumbnailDataUrl ?? thumbnail;
          if (persistedThumbnail && data.userMessage)
            next.set(data.userMessage.id, persistedThumbnail);
          return next;
        });

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          data.userMessage!,
          data.assistantMessage!,
        ]);
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setPdfThumbnails((prev) => {
          const next = new Map(prev);
          next.delete(tempId);
          return next;
        });
        toast.error("Failed to send PDF. Please try again.");
      }
    } else {
      // Plain text message — streamed response flow
      const tempId = `temp-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      setStreamingHasBegun(false);
      const tempUserMsg: ChatMessage = {
        id: tempId,
        conversationId: activeConversationId,
        applicationId,
        role: "user",
        content: text,
        thumbnailDataUrl: null,
        createdAt: new Date(),
      };
      const tempAssistantMsg: ChatMessage = {
        id: tempAssistantId,
        conversationId: activeConversationId,
        applicationId,
        role: "assistant",
        content: "",
        thumbnailDataUrl: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);

      let doneEvent: ChatStreamDoneEvent | null = null;

      try {
        const res = await fetch("/api/chat-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            applicationId,
            conversationId: activeConversationId,
            message: text,
          }),
        });

        if (!res.ok) {
          const errPayload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errPayload.error || "Failed to send message.");
        }

        if (!res.body) {
          throw new Error("Streaming response body is missing.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf("\n");

          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
            if (!line) continue;

            const event = JSON.parse(line) as ChatStreamEvent;
            if (event.type === "delta") {
              setStreamingHasBegun(true);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAssistantId
                    ? { ...msg, content: `${msg.content}${event.delta}` }
                    : msg,
                ),
              );
              continue;
            }

            if (event.type === "done") {
              doneEvent = event;
              continue;
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        const remaining = buffer.trim();
        if (remaining.length > 0) {
          const event = JSON.parse(remaining) as ChatStreamEvent;
          if (event.type === "done") {
            doneEvent = event;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!doneEvent) {
          throw new Error("The response stream ended before completion.");
        }
        const finalDoneEvent = doneEvent;

        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== tempId && msg.id !== tempAssistantId),
          finalDoneEvent.userMessage,
          finalDoneEvent.assistantMessage,
        ]);
      } catch (error) {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== tempId && msg.id !== tempAssistantId),
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to send message. Please try again.",
        );
      }
    }

    setLoading(false);
    setStreamingHasBegun(false);

    // Refresh conversation list in background (picks up auto-generated names)
    listConversationsAction({ applicationId }).then(([result]) => {
      if (result) setConversations(result);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedPdf(file);
    setAttachedPdfThumbnail(null);
    // Generate thumbnail in the background while user types their message
    generatePdfThumbnail(file).then((thumbnail) => {
      if (thumbnail) setAttachedPdfThumbnail(thumbnail);
    });
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    /* Responsive height: fullScreen lets content flow in the main scroll; fallback uses fixed heights */
    <div
      className={
        fullScreen ? "relative flex flex-1 flex-col" : "relative flex h-[500px] lg:h-[640px] flex-col"
      }
    >
      {/* Conversation history — fixed overlay (not inline sidebar) to avoid squishing chat.
          Uses CSS translate transition for symmetrical slide-in/slide-out animation.
          Body scroll is locked when open (see useEffect above). */}
      {conversations.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${
              sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setSidebarOpen(false)}
          />
          {/* Slide-in panel */}
          <div className={`fixed inset-y-0 right-0 z-50 w-72 sm:w-80 flex flex-col bg-background border-l shadow-xl transition-transform duration-200 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Chat History</h3>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleNewChat}
                  disabled={switchingConversation || messages.length === 0}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
            </div>
            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group relative flex items-center gap-3 mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    conv.id === activeConversationId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => handleSwitchConversation(conv.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${conv.id === activeConversationId ? "font-medium" : ""}`}>
                      {conv.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelativeDate(conv.updatedAt)}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &quot;{conv.name}&quot; and all its messages.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDeleteConversation(conv.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* New chat bar — sticky below topbar (top-16 matches PageHeader h-16).
          Only shown when current conversation has messages to prevent empty conversation accumulation. */}
      {conversations.length > 0 && messages.length > 0 && (
        <div className="sticky top-16 z-10 flex items-center justify-end px-4 py-2 border-b bg-background shrink-0 group-has-[[data-collapsible=icon]]/sidebar-wrapper:top-12">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleNewChat}
            disabled={switchingConversation}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New Chat
          </Button>
        </div>
      )}

      {/* Main chat area */}
      <div
        className="flex-1 overflow-y-auto p-4"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        <div className="space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-4">
            <div className="relative">
              <Avatar className="h-16 w-16 rounded-full overflow-hidden ring-4 ring-background shadow-md">
                <Image
                  src="/atlas_avatar.png"
                  alt="Atlas"
                  width={64}
                  height={64}
                  className="aspect-square h-full w-full rounded-full object-cover scale-[1.1]"
                />
              </Avatar>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-info text-2xs text-white ring-2 ring-background">
                ✓
              </span>
            </div>
            <div className="space-y-1.5 max-w-xs">
              <p className="font-semibold text-base">Atlas assistant</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                I&apos;ve reviewed your application and I&apos;m ready to help.
                Ask me anything — documents, risks, interview tips, or what
                officers look for.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-xs sm:max-w-sm">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs h-9 hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "user") {
            const { filename, text } = parsePdfMessage(msg.content);
            const thumbnail = pdfThumbnails.get(msg.id);

            return (
              <div key={msg.id} className="flex flex-col gap-1 items-end">
                {/* Name label offset to align with bubble text */}
                <span className="text-xs font-medium text-muted-foreground pr-[60px]">
                  {userName}
                </span>
                {/* Avatar and content row */}
                <div className="flex items-end gap-3 flex-row-reverse">
                  <Avatar className="h-8 w-8 shrink-0 rounded-full">
                    {userAvatar ? (
                      <AvatarImage
                        src={userAvatar}
                        alt={userName}
                        className="aspect-square h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <AvatarFallback className="rounded-full text-xs">
                        {userInitials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {/* PDF card and text bubble stacked vertically, right-aligned */}
                  <div className="flex flex-col gap-2 items-end max-w-[85%] sm:max-w-[75%]">
                    {filename && (
                      <div className="rounded-lg overflow-hidden border shadow-sm w-[180px] bg-white dark:bg-zinc-900">
                        {thumbnail ? (
                          <Image
                            src={thumbnail}
                            alt={filename}
                            width={180}
                            height={240}
                            unoptimized
                            className="w-full h-auto block"
                          />
                        ) : (
                          <div className="h-[160px] flex items-center justify-center bg-gray-50 dark:bg-zinc-800">
                            <FileTextIcon className="h-10 w-10 text-red-400/70" />
                          </div>
                        )}
                        <div className="px-2.5 py-2 border-t bg-white dark:bg-zinc-900">
                          <p className="text-xs font-medium truncate text-foreground">
                            {filename}
                          </p>
                          <p className="text-2xs text-muted-foreground">
                            PDF document
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Show text bubble only if there's accompanying text */}
                    {(text || !filename) && (
                      <div className="rounded-xl px-4 py-2.5 text-sm bg-primary text-primary-foreground">
                        {filename ? text : msg.content}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // Assistant message
          if (
            msg.id.startsWith("temp-assistant-") &&
            msg.content.length === 0 &&
            !streamingHasBegun
          ) {
            return null;
          }

          return (
            <div key={msg.id} className="flex flex-col gap-1 items-start">
              {/* Name label offset to align with bubble text */}
              <span className="text-xs font-medium text-muted-foreground pl-[60px]">
                Atlas
              </span>
              {/* Avatar and bubble row — items-end anchors avatar to bottom of bubble, Messenger-style */}
              <div className="flex items-end gap-3">
                <Avatar className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
                  <Image
                    src="/atlas_avatar.png"
                    alt="Atlas"
                    width={32}
                    height={32}
                    className="aspect-square h-full w-full rounded-full object-cover scale-[1.1]"
                  />
                </Avatar>
                <div className="max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-2.5 text-sm bg-muted text-foreground">
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ol:my-2 prose-li:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {normalizeMarkdownForDisplay(msg.content)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {loading && (!hasStreamingAssistantPlaceholder || !streamingHasBegun) && (
          /* Loading indicator matches the assistant message layout exactly */
          <div className="flex flex-col gap-1 items-start">
            <span className="text-xs font-medium text-muted-foreground pl-[60px]">
              Atlas is thinking…
            </span>
            <div className="flex items-end gap-3">
              <Avatar className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
                <Image
                  src="/atlas_avatar.png"
                  alt="Atlas"
                  width={32}
                  height={32}
                  className="aspect-square h-full w-full rounded-full object-cover scale-[1.1]"
                />
              </Avatar>
              <div className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-3">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      <div
        className={`border-t p-3 space-y-2 pb-[max(12px,env(safe-area-inset-bottom))] ${fullScreen ? "sticky bottom-0 bg-background z-10" : ""}`}
      >
        {/* Hidden file input — PDF only */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Attach PDF document"
        />

        {/* PDF preview card — replaces the small chip with a visual thumbnail */}
        {attachedPdf && (
          <div className="relative w-[160px] rounded-lg overflow-hidden border border-primary/30 shadow-sm ring-1 ring-primary/10 bg-white dark:bg-zinc-900">
            {attachedPdfThumbnail ? (
              <Image
                src={attachedPdfThumbnail}
                alt={attachedPdf.name}
                width={160}
                height={220}
                unoptimized
                className="w-full h-auto block"
              />
            ) : (
              <div className="h-[140px] flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-zinc-800">
                <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-2xs text-muted-foreground">
                  Loading preview…
                </span>
              </div>
            )}
            <div className="px-2.5 py-2 border-t bg-white dark:bg-zinc-900">
              <p className="text-xs font-medium truncate text-foreground">
                {attachedPdf.name}
              </p>
              <p className="text-2xs text-muted-foreground">Attached PDF</p>
            </div>
            {/* Dismiss button — positioned over the top-right corner of the thumbnail */}
            <button
              onClick={() => {
                setAttachedPdf(null);
                setAttachedPdfThumbnail(null);
              }}
              className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full p-0.5 transition-colors"
              aria-label="Remove attachment"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* History toggle */}
          {conversations.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              aria-label="Toggle conversations"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <HistoryIcon className="h-4 w-4" />
            </Button>
          )}
          {/* PDF attach button */}
          <Button
            variant="outline"
            size="icon"
            className={`h-10 w-10 shrink-0 ${attachedPdf ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10" : ""}`}
            aria-label="Attach PDF"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="h-4 w-4" />
          </Button>
          {/* Multiline textarea — auto-grows with content via field-sizing-content,
              caps at ~5 lines then scrolls internally. Enter sends, Shift+Enter adds newline. */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedPdf ? "Add a prompt for this PDF (optional)..." : "Ask Atlas anything…"
            }
            disabled={loading}
            className={`flex-1 min-h-10 max-h-[5lh] sm:max-h-[5lh] resize-none overflow-y-auto rounded-md border px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 field-sizing-content ${attachedPdf ? "border-primary/30 bg-primary/5" : "border-input bg-background"}`}
            inputMode="text"
            autoComplete="off"
            aria-label="Chat message"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && !attachedPdf) || loading}
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Send message"
          >
            {loading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Atlas may make mistakes — always verify with the official embassy.
        </p>
      </div>
    </div>
  );
}
