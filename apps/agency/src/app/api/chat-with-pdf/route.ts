import "server-only";

import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import OpenAI from "openai";
import {
  getOpenAIClient,
  isModelAvailabilityError,
  isTimeoutLikeAIError,
} from "@/lib/openai";
import { AI_TIMEOUT_CHAT_MS } from "@/constants";
import { buildAtlasSystemPrompt } from "@/services/atlas-prompt";

import { authorizeApplicationRouteAccess } from "@/app/api/_utils/application-route-auth";
import { requireRouteSession } from "@/app/api/_utils/request-auth";
import { logger, logAlert } from "@/infra/logger";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { getDB } from "@/db";
import {
  uploadedDocumentTable,
  visaApplicationTable,
  chatMessageTable,
  chatConversationTable,
  documentEvaluationTable,
  checklistItemTable,
  applicantTable,
  DOCUMENT_EXTRACTION_STATUS,
  DOCUMENT_INDEXING_STATUS,
  CHAT_ROLE,
  APPLICATION_PERMISSIONS,
} from "@/db/schema";
import { ensureDocumentExtraction, queueDocumentExtraction } from "@/services/document-pipeline";
import { getPdfPageCount, MAX_PDF_PAGE_COUNT } from "@/services/pdf-parser";
import { uploadToR2, buildR2Key, MAX_FILE_SIZE_BYTES } from "@/lib/r2";
import { sanitizeForPrompt } from "@/services/atlas-prompt";

// ~12 000 tokens of document text — leaves plenty of room for conversation history + response
const MAX_TEXT_CHARS = 48_000;

export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const routeAccess = await requireRouteSession();
    if ("response" in routeAccess) {
      return routeAccess.response;
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const applicationId = (formData.get("applicationId") as string | null)?.trim();
    const userText = ((formData.get("message") as string | null) ?? "").trim();
    const conversationId = (formData.get("conversationId") as string | null)?.trim();
    // Base64 JPEG data URL generated client-side — persisted so thumbnails survive refresh
    const thumbnailDataUrl = (formData.get("thumbnail") as string | null) || null;

    // 3. Validate
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
    }
    if (!applicationId) {
      return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 10 MB." },
        { status: 400 },
      );
    }

    // 4. Verify application access
    const applicationAccess = await authorizeApplicationRouteAccess(
      applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    if ("response" in applicationAccess) {
      return applicationAccess.response;
    }
    const { session: verifiedSession } = applicationAccess;
    const db = getDB();
    const app = await db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, applicationId),
    });

    if (!app) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate conversation belongs to this application
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    const conversation = await db.query.chatConversationTable.findFirst({
      where: and(
        eq(chatConversationTable.id, conversationId),
        eq(chatConversationTable.applicationId, applicationId),
      ),
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Rate limit: 20 PDF chat messages per hour per user
    try {
      await checkActionRateLimit("chatWithPdf", verifiedSession.user.id, 20);
    } catch {
      return NextResponse.json(
        { error: "You've sent too many messages. Please wait a few minutes before trying again." },
        { status: 429 },
      );
    }

    const { env, ctx } = await getCloudflareContext({ async: true });

    // Read the file bytes once — reused for both R2 upload and text extraction below
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const pageCount = await getPdfPageCount(fileBytes).catch(() => null);

    if (pageCount && pageCount > MAX_PDF_PAGE_COUNT) {
      return NextResponse.json(
        { error: `PDF exceeds the supported page limit of ${MAX_PDF_PAGE_COUNT} pages.` },
        { status: 400 },
      );
    }

    // 5. Upload to R2 (for record-keeping and background RAG indexing)
    let fileKey: string | null = null;
    let documentId: string | null = null;

    if (env.R2) {
      fileKey = buildR2Key(verifiedSession.user.id, applicationId, file.name, "chat-uploads");

      await uploadToR2({
        r2: env.R2,
        fileKey,
        bytes: fileBytes,
        contentType: "application/pdf",
        metadata: {
          uploadedBy: verifiedSession.user.id,
          applicationId,
          originalName: file.name,
          source: "chat",
        },
      });

      const [inserted] = await db
        .insert(uploadedDocumentTable)
        .values({
          applicationId,
          applicantId: null,
          checklistItemId: null,
          fileName: file.name,
          fileKey,
          fileSize: file.size,
          mimeType: "application/pdf",
          extractionStatus: DOCUMENT_EXTRACTION_STATUS.QUEUED,
          indexingStatus: DOCUMENT_INDEXING_STATUS.QUEUED,
          pageCount,
          chunkCount: 0,
        })
        .returning();

      documentId = inserted.id;
    }

    // 6. Extract text through the shared document pipeline so chat and upload
    // follow the same persistence and fallback behavior.
    let extractedText = "";
    if (documentId) {
      const extraction = await ensureDocumentExtraction({
        documentId,
      });

      if (extraction.success) {
        extractedText = extraction.textContent;
      } else {
        logger.warn("PDF extraction via shared pipeline failed", {
          documentId,
          error: extraction.error,
        });
      }
    }

    // Truncate very long documents to avoid overwhelming the context window
    if (extractedText.length > MAX_TEXT_CHARS) {
      extractedText =
        extractedText.slice(0, MAX_TEXT_CHARS) + "\n\n[... document truncated for length ...]";
    }

    // 7. Fetch recent conversation history, latest evaluation, checklist items, all uploaded docs, and applicant
    const [recentMessages, latestEvaluation, checklistItems, allUploadedDocs, applicant] =
      await Promise.all([
        db.query.chatMessageTable.findMany({
          where: and(
            eq(chatMessageTable.applicationId, applicationId),
            eq(chatMessageTable.conversationId, conversationId),
          ),
          orderBy: [asc(chatMessageTable.createdAt)],
          limit: 10,
        }),
        db.query.documentEvaluationTable.findFirst({
          where: eq(documentEvaluationTable.applicationId, applicationId),
          orderBy: [desc(documentEvaluationTable.createdAt)],
        }),
        db.query.checklistItemTable.findMany({
          where: eq(checklistItemTable.applicationId, applicationId),
          orderBy: [asc(checklistItemTable.sortOrder)],
        }),
        db.query.uploadedDocumentTable.findMany({
          where: eq(uploadedDocumentTable.applicationId, applicationId),
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
          where: eq(applicantTable.applicationId, applicationId),
          orderBy: [asc(applicantTable.createdAt)],
        }),
      ]);

    // 8. Build system prompt
    const safeFileName = sanitizeForPrompt(file.name, 255);
    const documentSection = extractedText
      ? `\n\nUPLOADED DOCUMENT — "${safeFileName}":\n${extractedText}`
      : `\n\nThe user uploaded "${safeFileName}" but the text could not be extracted (it may be a scanned image). Let the user know politely.`;

    const systemPrompt = buildAtlasSystemPrompt({
      application: app,
      applicant,
      latestEvaluation,
      checklistItems,
      uploadedDocs: allUploadedDocs,
      extraContext: documentSection,
      pdfMode: true,
      excludeDocId: documentId,
    });

    // 9. Build the user message content (shown in the chat bubble)
    const userMessageContent = extractedText
      ? `📄 **${file.name}**${userText ? `\n\n${userText}` : ""}`
      : `📄 **${file.name}** *(could not extract text)*${userText ? `\n\n${userText}` : ""}`;

    // The actual question sent to the AI.
    // Always include the filename so the model has explicit context about which document
    // is being discussed — otherwise vague messages like "this one?" get no document reference.
    const aiUserMessage = userText
      ? `I've uploaded "${safeFileName}". ${userText}`
      : `I've uploaded "${safeFileName}". Please read it and tell me what it is, whether it looks complete and correct for my ${app.visaType} visa application, and flag any issues you notice.`;

    // 10. Get OpenAI client
    const openai = getOpenAIClient();

    // 11. Build conversation array for OpenAI
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

    const conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...truncatedMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: aiUserMessage },
    ];

    const primaryModel = "gpt-5.4";
    const fallbackModel = "gpt-4.1";
    // gpt-5.4 can take longer with large prompts and long answers; use a wider
    // primary timeout to prevent aborting successful upstream completions.
    const primaryTimeoutMs = 90_000;
    const fallbackTimeoutMs = AI_TIMEOUT_CHAT_MS;
    let assistantContent: string;
    try {
      const response = await openai.chat.completions.create(
        {
          model: primaryModel,
          messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
        },
        { signal: AbortSignal.timeout(primaryTimeoutMs) },
      );
      assistantContent = response.choices[0].message.content || "";
    } catch (aiErr) {
      const isTimeout = aiErr instanceof DOMException && aiErr.name === "TimeoutError";
      const isAbort = aiErr instanceof DOMException && aiErr.name === "AbortError";
      const isPrimaryTimeoutLike = isTimeout || isAbort || isTimeoutLikeAIError({ error: aiErr });
      const shouldRetryWithFallback =
        isModelAvailabilityError({ error: aiErr, model: primaryModel }) || isPrimaryTimeoutLike;

      if (shouldRetryWithFallback) {
        logger.warn("Primary PDF-chat model unavailable, retrying fallback model", {
          primaryModel,
          fallbackModel,
          reason: isPrimaryTimeoutLike ? "timeout_or_abort" : "model_availability",
          error: aiErr,
        });
        try {
          const fallbackResponse = await openai.chat.completions.create(
            {
              model: fallbackModel,
              messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
            },
            { signal: AbortSignal.timeout(fallbackTimeoutMs) },
          );
          assistantContent = fallbackResponse.choices[0].message.content || "";
        } catch (fallbackErr) {
          const isFallbackTimeoutLike =
            (fallbackErr instanceof DOMException && fallbackErr.name === "TimeoutError") ||
            (fallbackErr instanceof DOMException && fallbackErr.name === "AbortError") ||
            isTimeoutLikeAIError({ error: fallbackErr });
          logAlert("ai_api_failure", "OpenAI primary+fallback failed (chat-with-pdf)", {
            primaryModel,
            fallbackModel,
            primaryError: aiErr,
            fallbackError: fallbackErr,
          });
          if (isPrimaryTimeoutLike || isFallbackTimeoutLike) {
            return NextResponse.json(
              { error: "The review support service is taking too long to respond. Please try again in a moment." },
              { status: 504 },
            );
          }
          return NextResponse.json(
            { error: "The review support service is temporarily unavailable. Please try again shortly." },
            { status: 503 },
          );
        }
      } else {
        logAlert("ai_api_failure", "OpenAI error (chat-with-pdf)", {
          model: primaryModel,
          error: aiErr,
        });
        return NextResponse.json(
          { error: "The review support service is temporarily unavailable. Please try again shortly." },
          { status: 503 },
        );
      }
    }

    // Check if this is the first message in the conversation (for name generation)
    const isFirstMessage = recentMessages.length === 0;

    // 12. Persist both messages to chat history (sequential — D1 constraint)
    const [userMessage] = await db
      .insert(chatMessageTable)
      .values({
        applicationId,
        conversationId,
        role: CHAT_ROLE.USER,
        content: userMessageContent,
        thumbnailDataUrl,
      })
      .returning();

    const [assistantMessage] = await db
      .insert(chatMessageTable)
      .values({
        applicationId,
        conversationId,
        role: CHAT_ROLE.ASSISTANT,
        content: assistantContent,
      })
      .returning();

    // Update conversation's updatedAt
    await db
      .update(chatConversationTable)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversationTable.id, conversationId));

    // 13. Trigger background indexing/reconciliation so future chat queries can
    // reuse the stored extraction via Atlas retrieval.
    if (documentId) {
      ctx.waitUntil(
        queueDocumentExtraction({
          documentId,
        }),
      );
    }

    // Fire-and-forget: generate conversation name from first message
    if (isFirstMessage) {
      const namePrompt = userText || `Uploaded ${file.name}`;
      const openaiForName = getOpenAIClient();
      ctx.waitUntil(
        openaiForName.chat.completions
          .create(
            {
              model: "gpt-4.1-nano",
              messages: [
                {
                  role: "system",
                  content:
                    "Generate a short title (max 6 words) for a chat conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes.",
                },
                { role: "user", content: namePrompt.slice(0, 500) },
              ],
              max_tokens: 30,
            },
            { signal: AbortSignal.timeout(10_000) },
          )
          .then(async (res) => {
            const name = (res.choices[0].message.content || "").trim().slice(0, 100);
            if (name) {
              await db
                .update(chatConversationTable)
                .set({ name })
                .where(eq(chatConversationTable.id, conversationId));
            }
          })
          .catch(() => {}),
      );
    }

    return NextResponse.json({ userMessage, assistantMessage });
  } catch (error) {
    logger.error("Unexpected error (chat-with-pdf)", { error });
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
