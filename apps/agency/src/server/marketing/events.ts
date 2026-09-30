import { and, eq, isNull } from "drizzle-orm";

import {
  MARKETING_EVENT_TYPE,
  marketingEventTable,
} from "@/db/schema";
import { getDB } from "@/db";

type Database = ReturnType<typeof getDB>;

interface RecordMarketingEventParams {
  db?: Database;
  type: (typeof MARKETING_EVENT_TYPE)[keyof typeof MARKETING_EVENT_TYPE];
  userId: string;
  applicationId?: string | null;
  payload?: Record<string, unknown>;
}

function shouldDedupeByType(type: RecordMarketingEventParams["type"]) {
  switch (type) {
    case MARKETING_EVENT_TYPE.USER_VERIFIED_EMAIL:
    case MARKETING_EVENT_TYPE.APPLICATION_CREATED:
    case MARKETING_EVENT_TYPE.DOCUMENT_UPLOADED:
    case MARKETING_EVENT_TYPE.EVALUATION_COMPLETED:
    case MARKETING_EVENT_TYPE.ONBOARDING_COMPLETED:
      return true;
    default:
      return false;
  }
}

export async function recordMarketingEvent({
  db = getDB(),
  type,
  userId,
  applicationId = null,
  payload,
}: RecordMarketingEventParams) {
  if (shouldDedupeByType(type)) {
    const existing = await db.query.marketingEventTable.findFirst({
      where: and(
        eq(marketingEventTable.type, type),
        eq(marketingEventTable.userId, userId),
        applicationId
          ? eq(marketingEventTable.applicationId, applicationId)
          : isNull(marketingEventTable.applicationId),
      ),
    });

    if (existing) {
      return existing;
    }
  }

  const [created] = await db
    .insert(marketingEventTable)
    .values({
      type,
      userId,
      applicationId,
      payload,
      occurredAt: new Date(),
    })
    .returning();

  return created;
}
