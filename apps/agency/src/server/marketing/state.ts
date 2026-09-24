import { and, desc, eq } from "drizzle-orm";

import { PAYMENT_STATUS, uploadedDocumentTable, documentEvaluationTable, visaApplicationTable } from "@/db/schema";
import type { getDB } from "@/db";

type Database = ReturnType<typeof getDB>;

export interface UserLifecycleState {
  latestApplicationId: string | null;
  hasApplication: boolean;
  hasUploadedDocuments: boolean;
  hasEvaluation: boolean;
  hasPaid: boolean;
  riskLevel: string | null;
}

export interface ApplicationLifecycleState {
  applicationId: string;
  hasUploadedDocuments: boolean;
  hasEvaluation: boolean;
  hasPaid: boolean;
  riskLevel: string | null;
}

async function getLatestApplicationForUser(db: Database, userId: string) {
  return db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.userId, userId),
    orderBy: [desc(visaApplicationTable.createdAt)],
    columns: {
      id: true,
      paymentStatus: true,
      riskLevel: true,
    },
  });
}

export async function getLifecycleStateForUser(
  db: Database,
  userId: string,
): Promise<UserLifecycleState> {
  const latestApplication = await getLatestApplicationForUser(db, userId);

  if (!latestApplication) {
    return {
      latestApplicationId: null,
      hasApplication: false,
      hasUploadedDocuments: false,
      hasEvaluation: false,
      hasPaid: false,
      riskLevel: null,
    };
  }

  const [firstUploadedDocument, firstEvaluation, paidApplication] = await Promise.all([
    db.query.uploadedDocumentTable.findFirst({
      where: eq(uploadedDocumentTable.applicationId, latestApplication.id),
      columns: { id: true },
    }),
    db.query.documentEvaluationTable.findFirst({
      where: eq(documentEvaluationTable.applicationId, latestApplication.id),
      columns: { id: true },
    }),
    db.query.visaApplicationTable.findFirst({
      where: and(
        eq(visaApplicationTable.userId, userId),
        eq(visaApplicationTable.paymentStatus, PAYMENT_STATUS.PAID),
      ),
      columns: { id: true },
    }),
  ]);

  return {
    latestApplicationId: latestApplication.id,
    hasApplication: true,
    hasUploadedDocuments: Boolean(firstUploadedDocument),
    hasEvaluation: Boolean(firstEvaluation),
    hasPaid: latestApplication.paymentStatus === PAYMENT_STATUS.PAID || Boolean(paidApplication),
    riskLevel: latestApplication.riskLevel ?? null,
  };
}

export async function getLifecycleStateForApplication({
  db,
  applicationId,
}: {
  db: Database;
  applicationId: string;
}): Promise<ApplicationLifecycleState> {
  const application = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
    columns: {
      id: true,
      paymentStatus: true,
      riskLevel: true,
    },
  });

  if (!application) {
    return {
      applicationId,
      hasUploadedDocuments: false,
      hasEvaluation: false,
      hasPaid: false,
      riskLevel: null,
    };
  }

  const [firstUploadedDocument, firstEvaluation] = await Promise.all([
    db.query.uploadedDocumentTable.findFirst({
      where: eq(uploadedDocumentTable.applicationId, application.id),
      columns: { id: true },
    }),
    db.query.documentEvaluationTable.findFirst({
      where: eq(documentEvaluationTable.applicationId, application.id),
      columns: { id: true },
    }),
  ]);

  return {
    applicationId: application.id,
    hasUploadedDocuments: Boolean(firstUploadedDocument),
    hasEvaluation: Boolean(firstEvaluation),
    hasPaid: application.paymentStatus === PAYMENT_STATUS.PAID,
    riskLevel: application.riskLevel ?? null,
  };
}
