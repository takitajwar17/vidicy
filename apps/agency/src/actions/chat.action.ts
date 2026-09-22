"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import type OpenAI from "openai";
import { eq, asc, desc, and } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db";
import {
  getOpenAIClient,
  isTimeoutLikeAIError,
} from "@/lib/openai";
import { AI_TIMEOUT_EMBEDDING_MS } from "@/constants";
import { buildAtlasSystemPrompt } from "@/services/atlas-prompt";
import { requireApplicationPermission } from "@/utils/application-auth";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { logger, logAlert } from "@/infra/logger";
import {
  visaApplicationTable,
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  chatMessageTable,
  chatConversationTable,
  APPLICATION_PERMISSIONS,
  CHAT_ROLE,
} from "@/db/schema";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";

// ---------------------------------------------------------------------------
// createConversationAction
// ---------------------------------------------------------------------------

const createConversationSchema = z.object({
  applicationId: z.string().min(1),
});

export const createConversationAction = createServerAction()
  .input(createConversationSchema)
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

    const db = getDB();

    const [conversation] = await db
      .insert(chatConversationTable)
      .values({ applicationId: input.applicationId })
      .returning();

    return conversation;
  });

// ---------------------------------------------------------------------------
// listConversationsAction
// ---------------------------------------------------------------------------

const listConversationsSchema = z.object({
  applicationId: z.string().min(1),
});

export const listConversationsAction = createServerAction()
  .input(listConversationsSchema)
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

    const db = getDB();

    const conversations = await db.query.chatConversationTable.findMany({
      where: eq(chatConversationTable.applicationId, input.applicationId),
      orderBy: [desc(chatConversationTable.updatedAt)],
    });

    return conversations;
  });

// ---------------------------------------------------------------------------
// getConversationMessagesAction
// ---------------------------------------------------------------------------

const getConversationMessagesSchema = z.object({
  applicationId: z.string().min(1),
  conversationId: z.string().min(1),
});

export const getConversationMessagesAction = createServerAction()
  .input(getConversationMessagesSchema)
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);
    const db = getDB();

    const messages = await db.query.chatMessageTable.findMany({
      where: and(
        eq(chatMessageTable.applicationId, input.applicationId),
        eq(chatMessageTable.conversationId, input.conversationId),
      ),
      orderBy: [asc(chatMessageTable.createdAt)],
    });

    return messages;
  });

// ---------------------------------------------------------------------------
// deleteConversationAction
// ---------------------------------------------------------------------------

const deleteConversationSchema = z.object({
  conversationId: z.string().min(1),
});

export const deleteConversationAction = createServerAction()
  .input(deleteConversationSchema)
  .handler(async ({ input }) => {
    const db = getDB();

    const conversation = await db.query.chatConversationTable.findFirst({
      where: eq(chatConversationTable.id, input.conversationId),
    });

    if (!conversation) {
      throw new ZSAError("NOT_FOUND", "Conversation not found");
    }

    await requireApplicationPermission(conversation.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

    // Delete messages first — D1 doesn't enforce FK cascades on ALTER-added columns
    await db.delete(chatMessageTable).where(eq(chatMessageTable.conversationId, input.conversationId));
    await db.delete(chatConversationTable).where(eq(chatConversationTable.id, input.conversationId));

    return { success: true };
  });

// ---------------------------------------------------------------------------
// renameConversationAction
// ---------------------------------------------------------------------------

const renameConversationSchema = z.object({
  conversationId: z.string().min(1),
  name: z.string().min(1).max(100),
});

export const renameConversationAction = createServerAction()
  .input(renameConversationSchema)
  .handler(async ({ input }) => {
    const db = getDB();

    const conversation = await db.query.chatConversationTable.findFirst({
      where: eq(chatConversationTable.id, input.conversationId),
    });

    if (!conversation) {
      throw new ZSAError("NOT_FOUND", "Conversation not found");
    }

    await requireApplicationPermission(conversation.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

    const [updated] = await db
      .update(chatConversationTable)
      .set({ name: input.name })
      .where(eq(chatConversationTable.id, input.conversationId))
      .returning();

    return updated;
  });

// ---------------------------------------------------------------------------
// generateConversationName (internal helper, not a server action)
// ---------------------------------------------------------------------------

async function generateConversationName(conversationId: string, firstMessage: string) {
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        {
          role: "system",
          content: "Generate a short title (max 6 words) for a chat conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes.",
        },
        { role: "user", content: firstMessage.slice(0, 500) },
      ],
      max_tokens: 30,
    }, { signal: AbortSignal.timeout(10_000) });

    const name = (response.choices[0].message.content || "").trim().slice(0, 100);
    if (name) {
      const db = getDB();
      await db
        .update(chatConversationTable)
        .set({ name })
        .where(eq(chatConversationTable.id, conversationId));
    }
  } catch (error) {
    logger.warn("Failed to generate conversation name (non-fatal)", { error });
  }
}

// ---------------------------------------------------------------------------
// sendChatMessageAction
// ---------------------------------------------------------------------------

const sendChatMessageSchema = z.object({
  applicationId: z.string().min(1),
  conversationId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

export const sendChatMessageAction = createServerAction()
  .input(sendChatMessageSchema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);
    await checkActionRateLimit("chatMessage", session.userId, 30);
    trackUsage({ userId: session.userId, event: USAGE_EVENTS.CHAT_MESSAGE_SENT, metadata: { applicationId: input.applicationId } });

    const db = getDB();

    const [application, conversation] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: eq(visaApplicationTable.id, input.applicationId),
      }),
      db.query.chatConversationTable.findFirst({
        where: and(
          eq(chatConversationTable.id, input.conversationId),
          eq(chatConversationTable.applicationId, input.applicationId),
        ),
      }),
    ]);

    if (!application) {
      throw new ZSAError("NOT_FOUND", "Application not found");
    }

    if (!conversation) {
      throw new ZSAError("NOT_FOUND", "Conversation not found");
    }

    const [rawRecentMessages, latestEvaluation, checklistItems, uploadedDocs, applicant] = await Promise.all([
      db.query.chatMessageTable.findMany({
        where: and(
          eq(chatMessageTable.applicationId, application.id),
          eq(chatMessageTable.conversationId, input.conversationId),
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
        columns: { id: true, checklistItemId: true, fileName: true, textContent: true, uploadedAt: true },
      }),
      db.query.applicantTable.findFirst({
        where: eq(applicantTable.applicationId, application.id),
        orderBy: [asc(applicantTable.createdAt)],
      }),
    ]);

    const recentMessages = rawRecentMessages.reverse();

    // Check if this is the first user message in the conversation (for name generation)
    const isFirstMessage = recentMessages.length === 0;

    const openai = getOpenAIClient();

    // RAG: retrieve relevant document chunks from Vectorize
    let documentContext = "";
    try {
      const { env } = getCloudflareContext();

      if (env.VECTORIZE) {
        const queryEmbeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: input.message,
        }, { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) });

        const queryVector = queryEmbeddingResponse.data[0].embedding;

        const vectorResults = await env.VECTORIZE.query(queryVector, {
          topK: 5,
          filter: { applicationId: application.id },
          returnMetadata: "all",
        });

        const relevantChunks = vectorResults.matches
          .filter((m) => m.score > 0.4)
          .map((m) => (m.metadata?.content as string) || "")
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

    const [userMessage] = await db
      .insert(chatMessageTable)
      .values({
        applicationId: application.id,
        conversationId: input.conversationId,
        role: CHAT_ROLE.USER,
        content: input.message,
      })
      .returning();

    // Cap total conversation history to ~8k chars to stay within token ceiling (R10)
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

    conversationHistory.push({ role: "user", content: input.message });

    let assistantContent: string;

    const model = "gpt-5.4";
    const timeoutMs = 90_000;
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
      }, { signal: AbortSignal.timeout(timeoutMs) });

      assistantContent = response.choices[0].message.content || "";
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isTimeoutLike = isTimeout || isAbort || isTimeoutLikeAIError({ error });
      if (isTimeoutLike) {
        logAlert("ai_api_failure", "OpenAI call timed out (sendChatMessage)", {
          model,
          error,
        });
        throw new ZSAError("TIMEOUT", "The AI service is taking too long to respond. Please try again in a moment.");
      }
      logAlert("ai_api_failure", "OpenAI call failed (sendChatMessage)", {
        model,
        error,
      });
      throw new ZSAError("INTERNAL_SERVER_ERROR", "The AI service is temporarily unavailable. Please try again shortly.");
    }

    const [assistantMessage] = await db
      .insert(chatMessageTable)
      .values({
        applicationId: application.id,
        conversationId: input.conversationId,
        role: CHAT_ROLE.ASSISTANT,
        content: assistantContent,
      })
      .returning();

    // Update conversation's updatedAt
    await db
      .update(chatConversationTable)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversationTable.id, input.conversationId));

    // Fire-and-forget: generate conversation name from first message
    if (isFirstMessage) {
      generateConversationName(input.conversationId, input.message).catch(() => {});
    }

    return { userMessage, assistantMessage };
  });
