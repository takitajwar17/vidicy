import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETING_EVENT_TYPE, PAYMENT_STATUS, RISK_LEVEL } from "@/db/schema";
import { recordMarketingEvent } from "@/server/marketing/events";
import {
  getLifecycleStateForApplication,
  getLifecycleStateForUser,
} from "@/server/marketing/state";

describe("recordMarketingEvent", () => {
  type RecordEventDb = NonNullable<Parameters<typeof recordMarketingEvent>[0]["db"]>;
  const findFirst = vi.fn();
  const returning = vi.fn();
  const values = vi.fn();
  const insert = vi.fn();

  const db = {
    query: {
      marketingEventTable: {
        findFirst,
      },
    },
    insert,
  } as unknown as RecordEventDb;

  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockReturnValue({ values });
    values.mockReturnValue({ returning });
    returning.mockResolvedValue([{ id: "mevt_123" }]);
  });

  it("dedupes first-occurrence document upload events per application", async () => {
    findFirst.mockResolvedValueOnce({ id: "mevt_existing" });

    const event = await recordMarketingEvent({
      db,
      type: MARKETING_EVENT_TYPE.DOCUMENT_UPLOADED,
      userId: "usr_123",
      applicationId: "vapp_123",
    });

    expect(event).toEqual({ id: "mevt_existing" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("records a new application-created event when one does not already exist", async () => {
    findFirst.mockResolvedValueOnce(undefined);

    const event = await recordMarketingEvent({
      db,
      type: MARKETING_EVENT_TYPE.APPLICATION_CREATED,
      userId: "usr_123",
      applicationId: "vapp_123",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(event).toEqual({ id: "mevt_123" });
  });
});

describe("lifecycle state helpers", () => {
  type LifecycleDb = Parameters<typeof getLifecycleStateForUser>[0];
  const userQuery = vi.fn();
  const appQuery = vi.fn();
  const docQuery = vi.fn();
  const evaluationQuery = vi.fn();

  const db = {
    query: {
      visaApplicationTable: {
        findFirst: userQuery,
      },
      uploadedDocumentTable: {
        findFirst: docQuery,
      },
      documentEvaluationTable: {
        findFirst: evaluationQuery,
      },
    },
  } as unknown as LifecycleDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes the latest user lifecycle state", async () => {
    userQuery
      .mockResolvedValueOnce({
        id: "vapp_latest",
        paymentStatus: PAYMENT_STATUS.PAID,
        riskLevel: RISK_LEVEL.MEDIUM,
      })
      .mockResolvedValueOnce({
        id: "vapp_paid",
        paymentStatus: PAYMENT_STATUS.PAID,
        riskLevel: RISK_LEVEL.MEDIUM,
      });
    docQuery.mockResolvedValue({ id: "udoc_123" });
    evaluationQuery.mockResolvedValue({ id: "deval_123" });

    const state = await getLifecycleStateForUser(db, "usr_123");

    expect(state).toEqual({
      latestApplicationId: "vapp_latest",
      hasApplication: true,
      hasUploadedDocuments: true,
      hasEvaluation: true,
      hasPaid: true,
      riskLevel: RISK_LEVEL.MEDIUM,
    });
  });

  it("summarizes application lifecycle state for branching", async () => {
    appQuery.mockResolvedValue({
      id: "vapp_paid",
      paymentStatus: PAYMENT_STATUS.PAID,
      riskLevel: RISK_LEVEL.LOW,
    });
    docQuery.mockResolvedValue({ id: "udoc_555" });
    evaluationQuery.mockResolvedValue({ id: "deval_555" });

    const state = await getLifecycleStateForApplication({
      db: {
        query: {
          visaApplicationTable: {
            findFirst: appQuery,
          },
          uploadedDocumentTable: {
            findFirst: docQuery,
          },
          documentEvaluationTable: {
            findFirst: evaluationQuery,
          },
        },
      } as unknown as LifecycleDb,
      applicationId: "vapp_paid",
    });

    expect(state).toEqual({
      applicationId: "vapp_paid",
      hasUploadedDocuments: true,
      hasEvaluation: true,
      hasPaid: true,
      riskLevel: RISK_LEVEL.LOW,
    });
  });
});
