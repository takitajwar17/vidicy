import "server-only";

import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import type OpenAI from "openai";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  getOpenAIClient,
  isModelAvailabilityError,
  isTimeoutLikeAIError,
} from "@/lib/openai";
import { AI_TIMEOUT_CHAT_MS, AI_TIMEOUT_EMBEDDING_MS } from "@/constants";
import { buildAtlasSystemPrompt } from "@/services/atlas-prompt";
import { authorizeApplicationRouteAccess } from "@/app/api/_utils/application-route-auth";
import { requireRouteSession } from "@/app/api/_utils/request-auth";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { retryD1Write } from "@/infra/d1-retry";
import { logger, logAlert } from "@/infra/logger";
import { getDB } from "@/db";
import {
  applicantTable,
  APPLICATION_PERMISSIONS,
  chatConversationTable,
  chatMessageTable,
  CHAT_ROLE,
  checklistItemTable,
  documentEvaluationTable,
  uploadedDocumentTable,
  visaApplicationTable,
} from "@/db/schema";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";

interface ChatStreamRequestBody {
  applicationId?: string;
  conversationId?: string;
  message?: string;
}

interface ChatStreamDeltaEvent {
  type: "delta";
  delta: string;
}

interface ChatStreamDoneEvent {
  type: "done";
  model: string;
  userMessage: unknown;
  assistantMessage: unknown;
}

interface ChatStreamErrorEvent {
  type: "error";
  message: string;
}

type ChatStreamEvent =
  | ChatStreamDeltaEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;

interface StreamAttemptResult {
  content: string;
  emitted: boolean;
  error: unknown | null;
}

interface InsertChatMessageInput {
  db: ReturnType<typeof getDB>;
  applicationId: string;
  conversationId: string;
  role: (typeof CHAT_ROLE)[keyof typeof CHAT_ROLE];
  content: string;
}

async function insertChatMessageWithRetry({
  db,
  applicationId,
  conversationId,
  role,
  content,
}: InsertChatMessageInput) {
  const [message] = await retryD1Write({
    operation: () =>
      db
        .insert(chatMessageTable)
        .values({
          applicationId,
          conversationId,
          role,
          content,
        })
        .returning(),
  });

  return message;
}

async function generateConversationName({
  conversationId,
  firstMessage,
}: {
  conversationId: string;
  firstMessage: string;
}) {
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create(
      {
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content:
              "Generate a short title (max 6 words) for a chat conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes.",
          },
          { role: "user", content: firstMessage.slice(0, 500) },
        ],
        max_tokens: 30,
      },
      { signal: AbortSignal.timeout(10_000) },
    );

    const name = (response.choices[0].message.content || "").trim().slice(0, 100);
    if (!name) return;

    const db = getDB();
    await retryD1Write({
      operation: () =>
        db
          .update(chatConversationTable)
          .set({ name })
          .where(eq(chatConversationTable.id, conversationId)),
    });
  } catch (error) {
    logger.warn("Failed to generate conversation name (non-fatal)", { error });
  }
}

async function attemptStreamingModel({
  openai,
  model,
  timeoutMs,
  messages,
  onDelta,
}: {
  openai: ReturnType<typeof getOpenAIClient>;
  model: string;
  timeoutMs: number;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  onDelta: (delta: string) => void;
}): Promise<StreamAttemptResult> {
  let content = "";
  let emitted = false;

  try {
    const stream = await openai.chat.completions.create(
      {
        model,
        messages,
        stream: true,
      },
      { signal: AbortSignal.timeout(timeoutMs) },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      emitted = true;
      content += delta;
      onDelta(delta);
    }

    return { content, emitted, error: null };
  } catch (error) {
    return { content, emitted, error };
  }
}

async function streamAssistantResponseWithFallback({
  openai,
  messages,
  onDelta,
}: {
  openai: ReturnType<typeof getOpenAIClient>;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  onDelta: (delta: string) => void;
}): Promise<{ assistantContent: string; modelUsed: string }> {
  const primaryModel = "gpt-5.4";
  const fallbackModel = "gpt-4.1";
  const primaryTimeoutMs = 90_000;
  const fallbackTimeoutMs = AI_TIMEOUT_CHAT_MS;

  const primaryAttempt = await attemptStreamingModel({
    openai,
    model: primaryModel,
    timeoutMs: primaryTimeoutMs,
    messages,
    onDelta,
  });

  if (!primaryAttempt.error) {
    return { assistantContent: primaryAttempt.content, modelUsed: primaryModel };
  }

  const shouldFallback =
    !primaryAttempt.emitted &&
    (isModelAvailabilityError({ error: primaryAttempt.error, model: primaryModel }) ||
      isTimeoutLikeAIError({ error: primaryAttempt.error }));

  if (!shouldFallback) {
    throw primaryAttempt.error;
  }

  logger.warn("Primary Atlas stream model unavailable, retrying fallback model", {
    primaryModel,
    fallbackModel,
    error: primaryAttempt.error,
  });

  const fallbackAttempt = await attemptStreamingModel({
    openai,
    model: fallbackModel,
    timeoutMs: fallbackTimeoutMs,
    messages,
    onDelta,
  });

  if (fallbackAttempt.error) {
    logAlert("ai_api_failure", "OpenAI primary+fallback failed (chat-stream)", {
      primaryModel,
      fallbackModel,
      primaryError: primaryAttempt.error,
      fallbackError: fallbackAttempt.error,
    });
    throw fallbackAttempt.error;
  }

  return { assistantContent: fallbackAttempt.content, modelUsed: fallbackModel };
}

function getFriendlyAIErrorMessage({
  error,
}: {
  error: unknown;
}): string {
  if (isTimeoutLikeAIError({ error })) {
    return "The review support service is taking too long to respond. Please try again in a moment.";
  }
  return "The review support service is temporarily unavailable. Please try again shortly.";
}

export async function POST(request: Request) {
  try {
    const routeAccess = await requireRouteSession();
    if ("response" in routeAccess) {
      return routeAccess.response;
    }

    const body = (await request.json().catch(() => null)) as ChatStreamRequestBody | null;
    const applicationId = body?.applicationId?.trim();
    const conversationId = body?.conversationId?.trim();
    const message = body?.message?.trim();

    if (!applicationId) {
      return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
    }
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const applicationAccess = await authorizeApplicationRouteAccess(
      applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    if ("response" in applicationAccess) {
      return applicationAccess.response;
    }
    const { session } = applicationAccess;

    try {
      await checkActionRateLimit("chatMessage", session.userId, 30);
    } catch {
      return NextResponse.json(
        { error: "You've sent too many messages. Please wait a few minutes before trying again." },
        { status: 429 },
      );
    }

    trackUsage({
      userId: session.userId,
      event: USAGE_EVENTS.CHAT_MESSAGE_SENT,
      metadata: { applicationId },
    });

    const db = getDB();
    const [application, conversation] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: eq(visaApplicationTable.id, applicationId),
      }),
      db.query.chatConversationTable.findFirst({
        where: and(
          eq(chatConversationTable.id, conversationId),
          eq(chatConversationTable.applicationId, applicationId),
        ),
      }),
    ]);

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const [rawRecentMessages, latestEvaluation, checklistItems, uploadedDocs, applicant] =
      await Promise.all([
        db.query.chatMessageTable.findMany({
          where: and(
            eq(chatMessageTable.applicationId, application.id),
            eq(chatMessageTable.conversationId, conversation.id),
          ),
          orderBy: [desc(chatMessageTable.createdAt)],
          limit: 10,
        }),
        db.query.documentEvaluationTable.findFirst({
          where: eq(documentEvaluationTable.applicationId, application.id),
          orderBy: [desc(documentEvaluationTable.createdAt)],
        }),
        db.query.checklistItemTable.findMany({
          where: eq(checklistItemTable.applicationId, application.id),
          orderBy: [asc(checklistItemTable.sortOrder)],
        }),
        db.query.uploadedDocumentTable.findMany({
          where: eq(uploadedDocumentTable.applicationId, application.id),
          orderBy: [desc(uploadedDocumentTable.uploadedAt)],
          columns: {
            id: true,
            checklistItemId: true,
            fileName: true,
            textContent: true,
            uploadedAt: true,
          },
        }),
        db.query.applicantTable.findFirst({
          where: eq(applicantTable.applicationId, application.id),
          orderBy: [asc(applicantTable.createdAt)],
        }),
      ]);

    const recentMessages = rawRecentMessages.reverse();
    const isFirstMessage = recentMessages.length === 0;
    const openai = getOpenAIClient();

    let documentContext = "";
    try {
      const { env } = getCloudflareContext();
      if (env.VECTORIZE) {
        const queryEmbeddingResponse = await openai.embeddings.create(
          {
            model: "text-embedding-3-small",
            input: message,
          },
          { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) },
        );

        const queryVector = queryEmbeddingResponse.data[0].embedding;
        const vectorResults = await env.VECTORIZE.query(queryVector, {
          topK: 5,
          filter: { applicationId: application.id },
          returnMetadata: "all",
        });

        const relevantChunks = (vectorResults.matches as Array<{
          score: number;
          metadata?: Record<string, unknown>;
        }>)
          .filter((match) => match.score > 0.4)
          .map((match) => (match.metadata?.content as string) || "")
          .filter(Boolean);

        if (relevantChunks.length > 0) {
          documentContext =
            "\n\nUPLOADED DOCUMENTS CONTEXT:\n" +
            "The following are excerpts from the applicant's uploaded documents. " +
            "Use this information to give precise, document-specific advice:\n\n" +
            relevantChunks.join("\n\n---\n\n");
        }
      }
    } catch (ragError) {
      logger.warn("RAG lookup failed (non-fatal)", { error: ragError });
    }

    const systemPrompt = buildAtlasSystemPrompt({
      application,
      applicant,
      latestEvaluation,
      checklistItems,
      uploadedDocs,
      extraContext: documentContext,
    });

    const userMessage = await insertChatMessageWithRetry({
      db,
      applicationId: application.id,
      conversationId: conversation.id,
      role: CHAT_ROLE.USER,
      content: message,
    });

    const MAX_CONVERSATION_CHARS = 16_000;
    let conversationBudget = 0;
    const truncatedMessages = recentMessages
      .slice()
      .reverse()
      .filter((msg) => {
        if (conversationBudget >= MAX_CONVERSATION_CHARS) return false;
        conversationBudget += msg.content.length;
        return true;
      })
      .reverse();

    const conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      truncatedMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
    conversationHistory.push({ role: "user", content: message });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const pushEvent = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          const { assistantContent, modelUsed } = await streamAssistantResponseWithFallback({
            openai,
            messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
            onDelta: (delta) => {
              pushEvent({ type: "delta", delta });
            },
          });

          const assistantMessage = await insertChatMessageWithRetry({
            db,
            applicationId: application.id,
            conversationId: conversation.id,
            role: CHAT_ROLE.ASSISTANT,
            content: assistantContent,
          });

          await retryD1Write({
            operation: () =>
              db
                .update(chatConversationTable)
                .set({ updatedAt: new Date() })
                .where(eq(chatConversationTable.id, conversation.id)),
          });

          if (isFirstMessage) {
            generateConversationName({
              conversationId: conversation.id,
              firstMessage: message,
            }).catch(() => {});
          }

          pushEvent({
            type: "done",
            model: modelUsed,
            userMessage,
            assistantMessage,
          });
        } catch (error) {
          logAlert("ai_api_failure", "OpenAI stream failed (chat-stream)", {
            model: "gpt-5.4",
            error,
          });
          pushEvent({
            type: "error",
            message: getFriendlyAIErrorMessage({ error }),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("Unexpected error (chat-stream)", { error });
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
