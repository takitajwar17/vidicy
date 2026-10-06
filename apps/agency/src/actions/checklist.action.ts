"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db";
import { getOpenAIClient, getPerplexityClient } from "@/lib/openai";
import { requireApplicationPermission } from "@/utils/application-auth";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { revalidatePath } from "next/cache";
import { logger, logAlert } from "@/infra/logger";
import { CACHE_TTL_7_DAYS, AI_TIMEOUT_CHAT_MS, AI_TIMEOUT_PERPLEXITY_MS } from "@/constants";
import { sanitizeCitationUrl } from "@/services/atlas-prompt";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";
import {
  visaApplicationTable,
  applicantTable,
  checklistItemTable,
  APPLICATION_PERMISSIONS,
  APPLICANT_RELATIONSHIP,
  CHECKLIST_ITEM_STATUS,
  VISA_APPLICATION_STATUS,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// generateChecklistAction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. generateChecklistAction
// ---------------------------------------------------------------------------

const generateChecklistSchema = z.object({
  applicationId: z.string().min(1),
  applicantId: z.string().min(1),
});

export const generateChecklistAction = createServerAction()
  .input(generateChecklistSchema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    await checkActionRateLimit("generateChecklist", session.userId, 5);
    trackUsage({
      userId: session.userId,
      event: USAGE_EVENTS.CHECKLIST_GENERATED,
      metadata: { applicationId: input.applicationId },
    });

    const db = getDB();

    const application = await db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, input.applicationId),
    });

    if (!application) {
      throw new ZSAError("NOT_FOUND", "Application not found");
    }

    // Verify applicant belongs to this application
    const applicant = await db.query.applicantTable.findFirst({
      where: and(
        eq(applicantTable.id, input.applicantId),
        eq(applicantTable.applicationId, input.applicationId),
      ),
    });

    if (!applicant) {
      throw new ZSAError("NOT_FOUND", "Applicant not found");
    }

    // Keep existing requirements and their uploaded files intact.
    const existingItems = await db.query.checklistItemTable.findMany({
      where: and(
        eq(checklistItemTable.applicationId, application.id),
        eq(checklistItemTable.applicantId, applicant.id),
      ),
    });
    if (existingItems.length > 0) return existingItems;

    const perplexity = getPerplexityClient();
    const openai = getOpenAIClient();

    const isDependent = applicant.relationship !== APPLICANT_RELATIONSHIP.PRIMARY;
    const applicantContext = isDependent
      ? `This is a ${applicant.relationship} applicant. Include dependent-specific documents (e.g. relationship proof, birth certificate, dependency documents) in addition to standard requirements.`
      : "This is the primary applicant.";

    // For dependent applicants, load the primary applicant upfront — used for both
    // (a) history context and (b) checklist-name consistency anchoring.
    let primaryApplicant: typeof applicant | null = null;
    if (isDependent) {
      primaryApplicant =
        (await db.query.applicantTable.findFirst({
          where: and(
            eq(applicantTable.applicationId, input.applicationId),
            eq(applicantTable.relationship, APPLICANT_RELATIONSHIP.PRIMARY),
          ),
        })) ?? null;
    }

    // History: read from typed applicant columns (canonical).
    // For the primary applicant use their own record; for dependents use the primary's record.
    // Legacy fallback: settings JSON for records created before the schema migration.
    const histSrc = isDependent ? (primaryApplicant ?? applicant) : applicant;
    let hasPriorApproval = histSrc.approvedBefore === true;
    let hasPriorRejection = histSrc.rejectedBefore === true;
    let approvedVisaType = histSrc.approvedVisaType ?? "";
    let approvedYear = histSrc.approvedYear ?? "";
    let rejectedVisaType = histSrc.rejectedVisaType ?? "";
    let rejectedYear = histSrc.rejectedYear ?? "";
    let rejectedReason = histSrc.rejectedReason ?? "";

    if (!hasPriorApproval && !hasPriorRejection) {
      // Legacy fallback for records created before the schema migration
      try {
        const s = JSON.parse(application.settings ?? "{}") as Record<string, string | boolean>;
        hasPriorApproval =
          s.approvedBefore === true || s.previousApplicationStatus === "previously_approved";
        hasPriorRejection =
          s.rejectedBefore === true || s.previousApplicationStatus === "previously_rejected";
        if (hasPriorApproval || hasPriorRejection) {
          approvedVisaType = String(s.approvedVisaType ?? "");
          approvedYear = String(s.approvedYear ?? "");
          rejectedVisaType = String(s.rejectedVisaType ?? "");
          rejectedYear = String(s.rejectedYear ?? "");
          rejectedReason = String(s.rejectedReason ?? "");
        }
      } catch {
        /* ignore */
      }
    }
    const hasBoth = hasPriorRejection && hasPriorApproval;

    const historyLines: string[] = [];
    if (hasPriorApproval) {
      historyLines.push(
        `- Previously approved for ${application.destinationCountry} visa${approvedVisaType ? ` (${approvedVisaType})` : ""}${approvedYear ? ` in ${approvedYear}` : ""}`,
      );
    }
    if (hasPriorRejection) {
      historyLines.push(
        `- Previously rejected for ${application.destinationCountry} visa${rejectedVisaType ? ` (${rejectedVisaType})` : ""}${rejectedYear ? ` in ${rejectedYear}` : ""}${rejectedReason ? `. Stated reason: ${rejectedReason}` : ""}`,
      );
    }
    const historyBlock = historyLines.join("\n");

    // For dependent applicants, load the primary applicant's existing checklist
    // so we can enforce consistent document names and descriptions for shared items
    let primaryChecklist: Array<{
      documentName: string;
      description: string;
      commonMistakes: string | null;
      isRequired: number | boolean;
    }> = [];
    if (isDependent && primaryApplicant) {
      primaryChecklist = await db.query.checklistItemTable.findMany({
        where: and(
          eq(checklistItemTable.applicationId, input.applicationId),
          eq(checklistItemTable.applicantId, primaryApplicant.id),
        ),
        columns: { documentName: true, description: true, commonMistakes: true, isRequired: true },
      });
    }

    // --- Change 6: KV cache for Perplexity research results (TTL = 7 days) ---
    let researchContext = "";
    let researchCitations: string[] = [];
    let researchSource: "live_search" | "cached" | "model_knowledge" = "model_knowledge";

    const cacheKey = `checklist-research:v1:${[application.visaType, application.destinationCountry, application.homeCountry, application.embassy].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, "-")).join(":")}`;

    let kv: KVNamespace | undefined;
    try {
      const { env } = getCloudflareContext();
      kv = env.APP_KV as KVNamespace | undefined;
    } catch {
      /* not in Workers context */
    }

    if (kv) {
      try {
        const cached = (await kv.get(cacheKey, "json")) as {
          context: string;
          citations: string[];
        } | null;
        if (cached?.context) {
          researchContext = cached.context;
          researchCitations = cached.citations ?? [];
          researchSource = "cached";
          logger.info("Perplexity cache hit", { cacheKey });
        }
      } catch {
        /* treat as cache miss */
      }
    }

    // Step 1: Use Perplexity sonar to retrieve current, official visa requirements (skip if cached)
    if (!researchContext) {
      try {
        // Build a rich, targeted search query including applicant history for context
        const historyQueryPart = hasPriorRejection
          ? `, previously rejected applicant (extra documents needed for reapplication)`
          : hasPriorApproval
            ? `, previously approved applicant`
            : "";
        const currentYear = new Date().getFullYear();
        const searchQuery = `${currentYear} official document checklist for ${application.visaType} visa to ${application.destinationCountry} for ${application.homeCountry} passport holders applying at ${application.embassy}${historyQueryPart}. List every required and optional document with validity rules.`;

        const perplexityResponse = await perplexity.chat.completions.create(
          {
            model: "sonar-pro",
            messages: [
              {
                role: "system",
                content: `You are a visa documentation specialist. Your task is to find the current, official document requirements for a specific visa application route.

Rules:
- Cite ONLY official sources: embassy websites, government portals, VFS Global, TLScontact, or BLS International
- State the current year (${currentYear}) requirements — flag if requirements changed recently
- Distinguish clearly: REQUIRED documents vs OPTIONAL/supporting documents vs STRONGLY RECOMMENDED
- For each document include: validity requirements (e.g. "valid 3+ months beyond stay"), format (original/copy/certified), and any country-specific rules
- Note any country-specific quirks for ${application.homeCountry} applicants (e.g. stricter financial proof, mandatory travel history, specific bank statement requirements)
- Note the top rejection reasons for this visa route
- Be exhaustive — missing a required document is worse than listing an extra one`,
              },
              {
                role: "user",
                content: searchQuery,
              },
            ],
          },
          { signal: AbortSignal.timeout(AI_TIMEOUT_PERPLEXITY_MS) },
        );

        researchContext = perplexityResponse.choices[0].message.content || "";
        // sonar-pro returns citations in the response object
        const rawResponse = perplexityResponse as unknown as { citations?: string[] };
        // Validate citation URLs — reject dangerous schemes (javascript:, data:, etc.)
        researchCitations = Array.isArray(rawResponse.citations)
          ? rawResponse.citations.map(sanitizeCitationUrl).filter((u): u is string => u !== null)
          : [];
        researchSource = "live_search";

        // Store in KV for 7 days (non-blocking, non-fatal)
        if (kv && researchContext) {
          kv.put(
            cacheKey,
            JSON.stringify({ context: researchContext, citations: researchCitations }),
            { expirationTtl: CACHE_TTL_7_DAYS },
          ).catch((err) => {
            logger.warn("KV cache write failed", { cacheKey, error: err });
          });
        }
      } catch (searchError) {
        logger.warn("Perplexity search failed, falling back to model knowledge", {
          error: searchError,
        });
        researchSource = "model_knowledge";
      }
    }

    let checklistItems: Array<{
      documentName: string;
      description: string;
      commonMistakes: string;
      isRequired: boolean;
      sortOrder: number;
    }> = [];

    // Step 2: Use GPT-4o to structure the research into the required JSON format
    try {
      const systemPrompt = `You are a senior visa officer with 15 years of experience reviewing ${application.visaType} visa applications for ${application.destinationCountry}. Return ONLY valid JSON in the exact schema requested. Do not add commentary outside the JSON.`;

      const primaryAnchor =
        primaryChecklist.length > 0
          ? `\n\nCONSISTENCY REQUIREMENT — PRIMARY APPLICANT'S CHECKLIST (already generated):
${JSON.stringify(
  primaryChecklist.map((i) => ({
    documentName: i.documentName,
    description: i.description,
    commonMistakes: i.commonMistakes,
  })),
  null,
  2,
)}

For any document that is the same as one in the primary applicant's checklist above, you MUST copy the exact same "documentName", "description", and "commonMistakes" values — do not rephrase or reword them. Only add or change items that are genuinely different for a ${applicant.relationship} applicant (e.g. relationship proof, birth certificate).`
          : "";

      // Prior rejection/approval block — informs GPT-4o to add reapplication-specific documents
      const rejectionBlock = hasBoth
        ? `\n\nPRIOR HISTORY — APPROVED AND REJECTED:
This applicant has both a prior approval${approvedVisaType ? ` (${approvedVisaType}${approvedYear ? `, ${approvedYear}` : ""})` : ""} AND a prior rejection${rejectedVisaType ? ` (${rejectedVisaType}${rejectedYear ? `, ${rejectedYear}` : ""})` : ""}${rejectedReason ? ` — rejection reason: ${rejectedReason}` : ""} for ${application.destinationCountry}.
You MUST include:
1. A cover letter directly addressing the rejection and demonstrating what has changed since then
2. Evidence of changed circumstances (e.g. new employment, stronger finances, family ties)
3. Previous visa approval as a supporting travel-history strength document
4. Any document category that may have caused the prior rejection, listed with extra-specific description requirements.`
        : hasPriorRejection
          ? `\n\nPRIOR REJECTION — MANDATORY EXTRA DOCUMENTS:
This applicant was previously rejected for a ${application.destinationCountry} visa${rejectedVisaType ? ` (${rejectedVisaType})` : ""}${rejectedYear ? ` in ${rejectedYear}` : ""}${rejectedReason ? `. Stated reason: ${rejectedReason}` : ""}.
You MUST include these additional items in the checklist:
1. A cover letter directly addressing why the previous application was rejected and what has changed
2. Evidence of changed circumstances (e.g. new employment, stronger financial position, family ties)
3. Any document that was weak or missing in the prior application should be listed with extra-specific description requirements.`
          : hasPriorApproval
            ? `\n\nPRIOR APPROVAL NOTE:
This applicant was previously approved for a ${application.destinationCountry} visa${approvedVisaType ? ` (${approvedVisaType})` : ""}${approvedYear ? ` in ${approvedYear}` : ""}. Include previous visa/travel history as a supporting strength document.`
            : "";

      const descriptionInstruction = `For "description": include (a) exactly what the document must show/contain, (b) validity requirements (e.g. "must be valid for at least 3 months beyond intended departure"), (c) format requirements (original, certified copy, or notarised), and (d) any ${application.homeCountry}-specific rules. Be specific — vague descriptions cause rejections.`;
      const mistakesInstruction = `For "commonMistakes": describe the single most common reason this specific document causes a visa rejection or delay. Be concrete, not generic (e.g. NOT "make sure it's valid" — instead "Bank statements must cover the last 3 months and show a minimum balance of €3,000 — statements older than 30 days are rejected").`;

      const userPrompt = researchContext
        ? `Based on the following up-to-date official visa requirements, generate a precise document checklist.

OFFICIAL REQUIREMENTS (from live embassy sources):
${researchContext}

Applicant details:
- Destination: ${application.destinationCountry}
- Visa type: ${application.visaType}
- Embassy: ${application.embassy}
- Passport country: ${application.homeCountry}
- Applying from: ${application.currentCountry}
- ${applicantContext}${historyBlock ? `\n\nAPPLICATION HISTORY:\n${historyBlock}` : ""}${rejectionBlock}${primaryAnchor}

${descriptionInstruction}
${mistakesInstruction}

Return a JSON object with a single key "items" containing ALL required documents plus any strongly recommended ones from the official requirements above. Each item must have:
{
  "items": [
    {
      "documentName": "string — concise official name",
      "description": "string — specific, actionable, includes validity/format/content rules",
      "commonMistakes": "string — the #1 concrete rejection-causing mistake for this document",
      "isRequired": true,
      "sortOrder": 1
    }
  ]
}
Rules:
- Mark isRequired: false ONLY if the official source explicitly labels it optional or "if applicable"
- Return between 5 and 18 items — never fewer, never more
- Assign sequential sortOrder: required items first (1, 2, 3...), then optional items after`
        : `Generate a precise document checklist for a ${application.visaType} visa to ${application.destinationCountry}.
Applicant: ${application.homeCountry} passport, applying from ${application.currentCountry} at ${application.embassy}.
${applicantContext}${historyBlock ? `\n\nAPPLICATION HISTORY:\n${historyBlock}` : ""}${rejectionBlock}${primaryAnchor}

${descriptionInstruction}
${mistakesInstruction}

Return a JSON object with a single key "items" containing 8–15 entries:
{
  "items": [
    {
      "documentName": "string — concise official name",
      "description": "string — specific, actionable, includes validity/format/content rules",
      "commonMistakes": "string — the #1 concrete rejection-causing mistake for this document",
      "isRequired": true,
      "sortOrder": 1
    }
  ]
}
Mark isRequired: false only for truly optional documents. Required items first in sortOrder, then optional.`;

      const response = await openai.chat.completions.create(
        {
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        },
        { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) },
      );

      const raw = JSON.parse(response.choices[0].message.content || "{}");

      if (Array.isArray(raw)) {
        checklistItems = raw;
      } else if (Array.isArray(raw.items)) {
        checklistItems = raw.items as typeof checklistItems;
      } else {
        const firstArrayValue = Object.values(raw).find((v) => Array.isArray(v));
        if (firstArrayValue && Array.isArray(firstArrayValue)) {
          checklistItems = firstArrayValue as typeof checklistItems;
        } else {
          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to generate checklist — the AI returned an unexpected format. Please try again.",
          );
        }
      }
    } catch (error) {
      logAlert("ai_api_failure", "OpenAI call failed (generateChecklist)", { error });
      throw new ZSAError("INTERNAL_SERVER_ERROR", "Failed to generate checklist");
    }

    // --- Change 5: Server-side post-processing before insert ---

    // Guardrail: reject obviously broken AI output
    if (checklistItems.length < 3 || checklistItems.length > 25) {
      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        `Checklist generation returned an unexpected number of items (${checklistItems.length}). Please try again.`,
      );
    }

    // Deduplication: drop items with identical documentName (case-insensitive), keep first occurrence
    const seenNames = new Set<string>();
    checklistItems = checklistItems.filter((item) => {
      const key = (item.documentName ?? "").toLowerCase().trim();
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // Normalize sortOrder: required items first, then optional, sequential 1-based
    const requiredItems = checklistItems.filter((i) => i.isRequired !== false);
    const optionalItems = checklistItems.filter((i) => i.isRequired === false);
    checklistItems = [
      ...requiredItems.map((item, idx) => ({ ...item, isRequired: true, sortOrder: idx + 1 })),
      ...optionalItems.map((item, idx) => ({
        ...item,
        isRequired: false,
        sortOrder: requiredItems.length + idx + 1,
      })),
    ];

    // Ensure every item has non-empty description and commonMistakes
    checklistItems = checklistItems.map((item) => ({
      ...item,
      description: item.description?.trim() || `Provide a valid ${item.documentName}.`,
      commonMistakes:
        item.commonMistakes?.trim() ||
        `Ensure the document is current and matches the requirements exactly.`,
    }));

    // D1 hard limit: 100 bound parameters per statement.
    // Each checklist row has 12 columns → max 8 rows per batch (8×12=96 ≤ 100).
    const BATCH_SIZE = 8;
    const rows = checklistItems.map((item) => ({
      applicationId: application.id,
      applicantId: applicant.id,
      documentName: item.documentName,
      description: item.description,
      commonMistakes: item.commonMistakes ?? null,
      isRequired: item.isRequired ?? true,
      status: CHECKLIST_ITEM_STATUS.PENDING,
      sortOrder: item.sortOrder ?? 0,
    }));

    // A second check covers another request that finished while the AI ran.
    const savedItems = await db.query.checklistItemTable.findMany({
      where: and(
        eq(checklistItemTable.applicationId, application.id),
        eq(checklistItemTable.applicantId, applicant.id),
      ),
    });
    if (savedItems.length > 0) return savedItems;

    // D1 batches commit together, so a failed insert cannot leave a partial checklist.
    const remainingBatches = [];
    for (let i = BATCH_SIZE; i < rows.length; i += BATCH_SIZE) {
      remainingBatches.push(
        db
          .insert(checklistItemTable)
          .values(rows.slice(i, i + BATCH_SIZE))
          .returning(),
      );
    }
    const insertedItems = (
      await db.batch([
        db.insert(checklistItemTable).values(rows.slice(0, BATCH_SIZE)).returning(),
        ...remainingBatches,
      ])
    ).flat();

    // Persist checklist metadata to typed columns (canonical)
    try {
      await db
        .update(visaApplicationTable)
        .set({
          status: VISA_APPLICATION_STATUS.IN_PROGRESS,
          checklistSource: researchSource,
          checklistGeneratedAt: new Date(),
          ...(researchCitations.length > 0 && { checklistCitations: researchCitations }),
        })
        .where(eq(visaApplicationTable.id, application.id));
    } catch {
      // Non-fatal — move application to in_progress regardless
      await db
        .update(visaApplicationTable)
        .set({ status: VISA_APPLICATION_STATUS.IN_PROGRESS })
        .where(eq(visaApplicationTable.id, application.id));
    }

    revalidatePath(`/dashboard/${application.id}`);
    return insertedItems;
  });
