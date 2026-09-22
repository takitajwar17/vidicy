import "server-only";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { authorizeApplicationRouteAccess } from "@/app/api/_utils/application-route-auth";
import { requireRouteSession } from "@/app/api/_utils/request-auth";
import { getDB } from "@/db";
import {
  applicantTable,
  uploadedDocumentTable,
  checklistItemTable,
  CHECKLIST_ITEM_STATUS,
  DOCUMENT_EXTRACTION_STATUS,
  DOCUMENT_INDEXING_STATUS,
  APPLICATION_PERMISSIONS,
  MARKETING_EVENT_TYPE,
} from "@/db/schema";
import { logger, logAlert } from "@/infra/logger";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";
import { buildR2Key, MAX_FILE_SIZE_BYTES, uploadToR2 } from "@/lib/r2";
import { queueDocumentExtraction } from "@/services/document-pipeline";
import { getPdfPageCount, MAX_PDF_PAGE_COUNT } from "@/services/pdf-parser";
import { recordMarketingEvent } from "@/server/marketing/events";

type DocumentUploadRouteKind = "pdf" | "image" | "auto";

const PDF_UPLOAD_MIME_TYPES = new Set(["application/pdf"]);
const IMAGE_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

function resolveUploadRouteKind(mimeType: string): Exclude<DocumentUploadRouteKind, "auto"> | null {
  if (PDF_UPLOAD_MIME_TYPES.has(mimeType)) {
    return "pdf";
  }

  if (IMAGE_UPLOAD_MIME_TYPES.has(mimeType)) {
    return "image";
  }

  return null;
}

function getAllowedMimeTypes(routeKind: DocumentUploadRouteKind): ReadonlySet<string> {
  if (routeKind === "pdf") {
    return PDF_UPLOAD_MIME_TYPES;
  }

  if (routeKind === "image") {
    return IMAGE_UPLOAD_MIME_TYPES;
  }

  return new Set([...PDF_UPLOAD_MIME_TYPES, ...IMAGE_UPLOAD_MIME_TYPES]);
}

function getUnsupportedMimeTypeError(routeKind: DocumentUploadRouteKind): string {
  if (routeKind === "pdf") {
    return "Unsupported file type. Allowed type: PDF.";
  }

  if (routeKind === "image") {
    return "Unsupported file type. Allowed types: JPEG, PNG.";
  }

  return "Unsupported file type. Allowed types: PDF, JPEG, PNG.";
}

async function validatePdfPageCount(bytes: Uint8Array): Promise<{ pageCount: number | null; response: Response | null }> {
  try {
    const pageCount = await getPdfPageCount(bytes);

    if (pageCount > MAX_PDF_PAGE_COUNT) {
      return {
        pageCount,
        response: NextResponse.json(
          {
            error: `PDF exceeds the supported page limit of ${MAX_PDF_PAGE_COUNT} pages.`,
          },
          { status: 400 },
        ),
      };
    }

    return { pageCount, response: null };
  } catch {
    return { pageCount: null, response: null };
  }
}

export async function handleDocumentUploadRoute({
  request,
  routeKind,
}: {
  request: Request;
  routeKind: DocumentUploadRouteKind;
}): Promise<Response> {
  try {
    const routeAccess = await requireRouteSession();
    if ("response" in routeAccess) {
      return routeAccess.response!;
    }

    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const applicationId = formData.get("applicationId") as string | null;
    let applicantId = formData.get("applicantId") as string | null;
    const checklistItemId = formData.get("checklistItemId") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }

    if (!applicationId || applicationId.trim() === "") {
      return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
    }

    const applicationIdValue = applicationId.trim();
    const checklistItemIdValue = checklistItemId?.trim() || null;
    applicantId = applicantId?.trim() || null;

    if (!checklistItemIdValue) {
      return NextResponse.json(
        { error: "checklistItemId is required. Upload from a checklist document row." },
        { status: 400 },
      );
    }

    const normalizedMimeType = file.type.trim().toLowerCase();
    const resolvedRouteKind =
      routeKind === "auto" ? resolveUploadRouteKind(normalizedMimeType) : routeKind;
    const allowedMimeTypes = getAllowedMimeTypes(routeKind);

    if (!resolvedRouteKind || !allowedMimeTypes.has(normalizedMimeType)) {
      return NextResponse.json(
        { error: getUnsupportedMimeTypeError(routeKind) },
        { status: 400 },
      );
    }

    const applicationAccess = await authorizeApplicationRouteAccess(
      applicationIdValue,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    if ("response" in applicationAccess) {
      return applicationAccess.response!;
    }

    const { session: verifiedSession } = applicationAccess;
    const db = getDB();

    if (applicantId) {
      const applicant = await db.query.applicantTable.findFirst({
        where: and(
          eq(applicantTable.id, applicantId),
          eq(applicantTable.applicationId, applicationIdValue),
        ),
        columns: { id: true },
      });

      if (!applicant) {
        return NextResponse.json(
          { error: "Invalid applicantId for this application" },
          { status: 400 },
        );
      }
    }

    const checklistItem = await db.query.checklistItemTable.findFirst({
      where: and(
        eq(checklistItemTable.id, checklistItemIdValue),
        eq(checklistItemTable.applicationId, applicationIdValue),
      ),
      columns: { id: true, applicantId: true },
    });

    if (!checklistItem) {
      return NextResponse.json(
        { error: "Invalid checklistItemId for this application" },
        { status: 400 },
      );
    }

    const checklistItemApplicantId = checklistItem.applicantId ?? null;
    if (applicantId && checklistItemApplicantId && applicantId !== checklistItemApplicantId) {
      return NextResponse.json(
        { error: "checklistItemId does not belong to the provided applicantId" },
        { status: 400 },
      );
    }

    if (!applicantId && checklistItemApplicantId) {
      applicantId = checklistItemApplicantId;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 10 MB." },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfPageValidation =
      resolvedRouteKind === "pdf"
        ? await validatePdfPageCount(bytes)
        : { pageCount: 1, response: null };

    if (pdfPageValidation.response) {
      return pdfPageValidation.response;
    }

    const { env, ctx } = await getCloudflareContext({ async: true });

    if (!env.R2) {
      return NextResponse.json(
        { error: "Storage unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const fileKey = buildR2Key(verifiedSession.user.id, applicationIdValue, file.name);

    try {
      await uploadToR2({
        r2: env.R2,
        fileKey,
        bytes,
        contentType: normalizedMimeType,
        metadata: {
          uploadedBy: verifiedSession.user.id,
          applicationId: applicationIdValue,
          originalName: file.name,
        },
      });
    } catch (r2Error) {
      logAlert("r2_failure", "R2 upload failed", {
        error: r2Error,
        userId: verifiedSession.user.id,
        applicationId: applicationIdValue,
      });
      return NextResponse.json(
        { error: "Document storage failed. Please try again later." },
        { status: 503 },
      );
    }

    trackUsage({
      userId: verifiedSession.user.id,
      event: USAGE_EVENTS.DOCUMENT_UPLOADED,
      metadata: { applicationId: applicationIdValue, mimeType: normalizedMimeType },
    });

    const [insertedDocument] = await db
      .insert(uploadedDocumentTable)
      .values({
        applicationId: applicationIdValue,
        applicantId: applicantId || null,
        checklistItemId: checklistItemIdValue,
        fileName: file.name,
        fileKey,
        fileSize: file.size,
        mimeType: normalizedMimeType,
        chunkCount: 0,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.QUEUED,
        indexingStatus: DOCUMENT_INDEXING_STATUS.QUEUED,
        pageCount: pdfPageValidation.pageCount,
      })
      .returning();

    await recordMarketingEvent({
      db,
      type: MARKETING_EVENT_TYPE.DOCUMENT_UPLOADED,
      userId: verifiedSession.user.id,
      applicationId: applicationIdValue,
      payload: {
        documentId: insertedDocument.id,
        checklistItemId: checklistItemIdValue,
      },
    });

    await db
      .update(checklistItemTable)
      .set({ status: CHECKLIST_ITEM_STATUS.UPLOADED })
      .where(
        and(
          eq(checklistItemTable.id, checklistItemIdValue),
          eq(checklistItemTable.applicationId, applicationIdValue),
        ),
      );

    ctx.waitUntil(queueDocumentExtraction({ documentId: insertedDocument.id }));

    return NextResponse.json({
      success: true,
      documentId: insertedDocument.id,
      fileName: insertedDocument.fileName,
      fileSize: insertedDocument.fileSize,
    });
  } catch (error) {
    logger.error("Unexpected error (document upload route)", { error, routeKind });

    return NextResponse.json(
      { error: "An unexpected error occurred while uploading the document." },
      { status: 500 },
    );
  }
}
