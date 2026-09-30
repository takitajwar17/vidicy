import "server-only";

import { getDB } from "@/db";
import {
  userTable,
  visaApplicationTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  chatMessageTable,
  checklistItemTable,
  supportTicketTable,
  applicantTable,
  agencyTeamMemberTable,
  AGENCY_STAFF_STATUS,
  enterpriseInquiryTable,
  SUPPORT_TICKET_STATUS,
} from "@/db/schema";
import { eq, sql, gte, isNull, isNotNull, desc, and, not } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { USAGE_EVENTS } from "@/infra/usage-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformStats {
  users: {
    total: number;
    newToday: number;
    newThisMonth: number;
    verified: number;
    unverified: number;
    admins: number;
    withGoogle: number;
    withPassword: number;
    recentSignups: { id: string; email: string | null; firstName: string | null; createdAt: Date }[];
  };
  applications: {
    total: number;
    active: number;
    trashed: number;
    byStatus: Record<string, number>;
    byRiskLevel: Record<string, number>;
    avgReadinessScore: number | null;
    withChecklist: number;
    withEvaluation: number;
    topDestinations: { country: string; count: number }[];
    topVisaTypes: { visaType: string; count: number }[];
    outcomes: { approved: number; rejected: number; pending: number };
    recentApps: { id: string; name: string; destinationCountry: string | null; visaType: string | null; status: string; createdAt: Date }[];
  };
  applicants: {
    total: number;
    byRelationship: Record<string, number>;
    withPriorApproval: number;
    withPriorRejection: number;
  };
  documents: {
    total: number;
    totalSizeBytes: number;
    avgSizeBytes: number;
    byExtractionStatus: Record<string, number>;
    pipelineSuccessRate: number;
    totalChunks: number;
  };
  evaluations: {
    total: number;
    avgScore: number | null;
    byRiskLevel: Record<string, number>;
    byConfidence: Record<string, number>;
  };
  chatMessages: {
    total: number;
    byUser: number;
    byAssistant: number;
    appsWithChat: number;
  };
  checklists: {
    total: number;
    required: number;
    optional: number;
    byStatus: Record<string, number>;
  };
  support: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    avgResolutionHours: number | null;
  };
	  agencyTeam: {
	    totalStaff: number;
	    activeStaff: number;
	    linkedStaff: number;
	  };
  enterprise: {
    total: number;
    byStatus: Record<string, number>;
  };
  growth: {
    daily: { date: string; users: number; apps: number }[];
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function toRecord<T extends { count: number }>(rows: T[], keyFn: (r: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) result[keyFn(row)] = Number(row.count);
  return result;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const db = getDB();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const [
    totalUsers, newUsersToday, newUsersMonth,
    verifiedUsers, adminUsers, googleUsers, passwordUsers,
    recentSignups,
    totalApps, activeApps, appsByStatus, appsByRisk,
    avgReadiness, appsWithChecklist, appsWithEval,
    topDestinations, topVisaTypes,
    outcomeApproved, outcomeRejected, recentApps,
    totalApplicants, applicantsByRel, priorApprovals, priorRejections,
    totalDocs, docSizeAgg, docsByExtractionStatus, totalChunks,
    totalEvals, evalAvgScore, evalsByRisk, evalsByConfidence,
    totalChat, chatByUser, chatByAssistant, appsWithChat,
    totalChecklist, requiredChecklist, checklistByStatus,
    totalTickets, openTickets, inProgressTickets, resolvedTickets, closedTickets,
    ticketsByCategory, ticketsByPriority, avgResolution,
	    totalStaff, activeStaff, linkedStaff,
    totalEnterprise, enterpriseByStatus,
    userGrowth, appGrowth,
  ] = await Promise.all([
    // Users
    db.$count(userTable),
    db.$count(userTable, gte(userTable.createdAt, todayStart)),
    db.$count(userTable, gte(userTable.createdAt, monthStart)),
    db.$count(userTable, isNotNull(userTable.emailVerified)),
    db.$count(userTable, eq(userTable.role, "admin")),
    db.$count(userTable, isNotNull(userTable.googleAccountId)),
    db.$count(userTable, isNotNull(userTable.passwordHash)),
    db.select({ id: userTable.id, email: userTable.email, firstName: userTable.firstName, createdAt: userTable.createdAt })
      .from(userTable).orderBy(desc(userTable.createdAt)).limit(10),

    // Applications
    db.$count(visaApplicationTable),
    db.$count(visaApplicationTable, isNull(visaApplicationTable.trashedAt)),
    db.select({ status: visaApplicationTable.status, count: sql<number>`count(*)` })
      .from(visaApplicationTable).where(isNull(visaApplicationTable.trashedAt)).groupBy(visaApplicationTable.status),
    db.select({ risk: visaApplicationTable.riskLevel, count: sql<number>`count(*)` })
      .from(visaApplicationTable).where(and(isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.riskLevel)))
      .groupBy(visaApplicationTable.riskLevel),
    db.select({ avg: sql<number>`avg(${visaApplicationTable.readinessScore})` }).from(visaApplicationTable)
      .where(and(isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.readinessScore))),
    db.$count(visaApplicationTable, and(isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.checklistGeneratedAt))),
    db.select({ count: sql<number>`count(distinct ${documentEvaluationTable.applicationId})` }).from(documentEvaluationTable),
    db.select({ country: visaApplicationTable.destinationCountry, count: sql<number>`count(*)` })
      .from(visaApplicationTable)
      .where(and(isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.destinationCountry), not(eq(visaApplicationTable.destinationCountry, ""))))
      .groupBy(visaApplicationTable.destinationCountry).orderBy(sql`count(*) desc`).limit(10),
    db.select({ visaType: visaApplicationTable.visaType, count: sql<number>`count(*)` })
      .from(visaApplicationTable)
      .where(and(isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.visaType), not(eq(visaApplicationTable.visaType, ""))))
      .groupBy(visaApplicationTable.visaType).orderBy(sql`count(*) desc`).limit(10),
    db.$count(visaApplicationTable, and(isNull(visaApplicationTable.trashedAt), eq(visaApplicationTable.actualOutcome, "approved"))),
    db.$count(visaApplicationTable, and(isNull(visaApplicationTable.trashedAt), eq(visaApplicationTable.actualOutcome, "rejected"))),
    db.select({ id: visaApplicationTable.id, name: visaApplicationTable.name, destinationCountry: visaApplicationTable.destinationCountry, visaType: visaApplicationTable.visaType, status: visaApplicationTable.status, createdAt: visaApplicationTable.createdAt })
      .from(visaApplicationTable).where(isNull(visaApplicationTable.trashedAt)).orderBy(desc(visaApplicationTable.createdAt)).limit(10),

    // Applicants
    db.$count(applicantTable),
    db.select({ rel: applicantTable.relationship, count: sql<number>`count(*)` })
      .from(applicantTable).groupBy(applicantTable.relationship),
    db.$count(applicantTable, eq(applicantTable.approvedBefore, true)),
    db.$count(applicantTable, eq(applicantTable.rejectedBefore, true)),

    // Documents
    db.$count(uploadedDocumentTable),
    db.select({ totalSize: sql<number>`coalesce(sum(${uploadedDocumentTable.fileSize}), 0)`, avgSize: sql<number>`coalesce(avg(${uploadedDocumentTable.fileSize}), 0)` })
      .from(uploadedDocumentTable),
    db.select({ status: uploadedDocumentTable.extractionStatus, count: sql<number>`count(*)` })
      .from(uploadedDocumentTable).groupBy(uploadedDocumentTable.extractionStatus),
    db.select({ total: sql<number>`coalesce(sum(${uploadedDocumentTable.chunkCount}), 0)` }).from(uploadedDocumentTable),

    // Evaluations
    db.$count(documentEvaluationTable),
    db.select({ avg: sql<number>`avg(${documentEvaluationTable.overallScore})` }).from(documentEvaluationTable)
      .where(isNotNull(documentEvaluationTable.overallScore)),
    db.select({ risk: documentEvaluationTable.riskLevel, count: sql<number>`count(*)` })
      .from(documentEvaluationTable).where(isNotNull(documentEvaluationTable.riskLevel)).groupBy(documentEvaluationTable.riskLevel),
    db.select({ confidence: documentEvaluationTable.scoreConfidence, count: sql<number>`count(*)` })
      .from(documentEvaluationTable).where(isNotNull(documentEvaluationTable.scoreConfidence)).groupBy(documentEvaluationTable.scoreConfidence),

    // Chat
    db.$count(chatMessageTable),
    db.$count(chatMessageTable, eq(chatMessageTable.role, "user")),
    db.$count(chatMessageTable, eq(chatMessageTable.role, "assistant")),
    db.select({ count: sql<number>`count(distinct ${chatMessageTable.applicationId})` }).from(chatMessageTable),

    // Checklists
    db.$count(checklistItemTable),
    db.$count(checklistItemTable, eq(checklistItemTable.isRequired, true)),
    db.select({ status: checklistItemTable.status, count: sql<number>`count(*)` })
      .from(checklistItemTable).groupBy(checklistItemTable.status),

    // Support
    db.$count(supportTicketTable),
    db.$count(supportTicketTable, eq(supportTicketTable.status, SUPPORT_TICKET_STATUS.OPEN)),
    db.$count(supportTicketTable, eq(supportTicketTable.status, SUPPORT_TICKET_STATUS.IN_PROGRESS)),
    db.$count(supportTicketTable, eq(supportTicketTable.status, SUPPORT_TICKET_STATUS.RESOLVED)),
    db.$count(supportTicketTable, eq(supportTicketTable.status, SUPPORT_TICKET_STATUS.CLOSED)),
    db.select({ category: supportTicketTable.category, count: sql<number>`count(*)` })
      .from(supportTicketTable).groupBy(supportTicketTable.category),
    db.select({ priority: supportTicketTable.priority, count: sql<number>`count(*)` })
      .from(supportTicketTable).groupBy(supportTicketTable.priority),
    db.select({
      avg: sql<number>`avg((julianday(${supportTicketTable.resolvedAt}, 'unixepoch') - julianday(${supportTicketTable.createdAt}, 'unixepoch')) * 24)`,
    }).from(supportTicketTable).where(isNotNull(supportTicketTable.resolvedAt)),

	    // Agency team
	    db.$count(agencyTeamMemberTable),
	    db.$count(agencyTeamMemberTable, eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE)),
	    db.$count(
	      agencyTeamMemberTable,
	      and(
	        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
	        isNotNull(agencyTeamMemberTable.userId),
	      ),
	    ),

    // Enterprise
    db.$count(enterpriseInquiryTable),
    db.select({ status: enterpriseInquiryTable.status, count: sql<number>`count(*)` })
      .from(enterpriseInquiryTable).groupBy(enterpriseInquiryTable.status),

    // Growth: last 14 days
    db.select({ day: sql<string>`date(${userTable.createdAt}, 'unixepoch')`.as("day"), count: sql<number>`count(*)` })
      .from(userTable).where(gte(userTable.createdAt, fourteenDaysAgo))
      .groupBy(sql`date(${userTable.createdAt}, 'unixepoch')`).orderBy(sql`day asc`),
    db.select({ day: sql<string>`date(${visaApplicationTable.createdAt}, 'unixepoch')`.as("day"), count: sql<number>`count(*)` })
      .from(visaApplicationTable).where(gte(visaApplicationTable.createdAt, fourteenDaysAgo))
      .groupBy(sql`date(${visaApplicationTable.createdAt}, 'unixepoch')`).orderBy(sql`day asc`),
  ]);

  // Merge growth data
  const growthMap = new Map<string, { users: number; apps: number }>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    growthMap.set(d.toISOString().slice(0, 10), { users: 0, apps: 0 });
  }
  for (const row of userGrowth) { const e = growthMap.get(row.day); if (e) e.users = Number(row.count); }
  for (const row of appGrowth) { const e = growthMap.get(row.day); if (e) e.apps = Number(row.count); }

  // Pipeline success rate
  const processedTotal = Number(docsByExtractionStatus.find((r) => r.status === "completed")?.count ?? 0)
    + Number(docsByExtractionStatus.find((r) => r.status === "failed")?.count ?? 0);
  const completedCount = Number(docsByExtractionStatus.find((r) => r.status === "completed")?.count ?? 0);
  const pipelineSuccessRate = processedTotal > 0 ? completedCount / processedTotal : 1;

  return {
    users: {
      total: totalUsers, newToday: newUsersToday, newThisMonth: newUsersMonth,
      verified: verifiedUsers, unverified: totalUsers - verifiedUsers,
      admins: adminUsers, withGoogle: googleUsers,
      withPassword: passwordUsers, recentSignups,
    },
    applications: {
      total: totalApps, active: activeApps, trashed: totalApps - activeApps,
      byStatus: toRecord(appsByStatus, (r) => r.status),
      byRiskLevel: toRecord(appsByRisk, (r) => r.risk ?? "unknown"),
      avgReadinessScore: avgReadiness[0]?.avg != null ? Math.round(Number(avgReadiness[0].avg)) : null,
      withChecklist: appsWithChecklist,
      withEvaluation: Number(appsWithEval[0]?.count ?? 0),
      topDestinations: topDestinations.map((r) => ({ country: r.country ?? "Unknown", count: Number(r.count) })),
      topVisaTypes: topVisaTypes.map((r) => ({ visaType: r.visaType ?? "Unknown", count: Number(r.count) })),
      outcomes: { approved: outcomeApproved, rejected: outcomeRejected, pending: activeApps - outcomeApproved - outcomeRejected },
      recentApps,
    },
    applicants: {
      total: totalApplicants,
      byRelationship: toRecord(applicantsByRel, (r) => r.rel ?? "unknown"),
      withPriorApproval: priorApprovals, withPriorRejection: priorRejections,
    },
    documents: {
      total: totalDocs,
      totalSizeBytes: Number(docSizeAgg[0]?.totalSize ?? 0),
      avgSizeBytes: Math.round(Number(docSizeAgg[0]?.avgSize ?? 0)),
      byExtractionStatus: toRecord(docsByExtractionStatus, (r) => r.status),
      pipelineSuccessRate, totalChunks: Number(totalChunks[0]?.total ?? 0),
    },
    evaluations: {
      total: totalEvals,
      avgScore: evalAvgScore[0]?.avg != null ? Math.round(Number(evalAvgScore[0].avg)) : null,
      byRiskLevel: toRecord(evalsByRisk, (r) => r.risk ?? "unknown"),
      byConfidence: toRecord(evalsByConfidence, (r) => r.confidence ?? "unknown"),
    },
    chatMessages: {
      total: totalChat, byUser: chatByUser, byAssistant: chatByAssistant,
      appsWithChat: Number(appsWithChat[0]?.count ?? 0),
    },
    checklists: {
      total: totalChecklist, required: requiredChecklist, optional: totalChecklist - requiredChecklist,
      byStatus: toRecord(checklistByStatus, (r) => r.status),
    },
    support: {
      total: totalTickets, open: openTickets, inProgress: inProgressTickets,
      resolved: resolvedTickets, closed: closedTickets,
      byCategory: toRecord(ticketsByCategory, (r) => r.category ?? "unknown"),
      byPriority: toRecord(ticketsByPriority, (r) => r.priority ?? "unknown"),
      avgResolutionHours: avgResolution[0]?.avg != null ? Math.round(Number(avgResolution[0].avg) * 10) / 10 : null,
    },
	    agencyTeam: {
	      totalStaff,
	      activeStaff,
	      linkedStaff,
	    },
    enterprise: {
      total: totalEnterprise,
      byStatus: toRecord(enterpriseByStatus, (r) => r.status),
    },
    growth: {
      daily: Array.from(growthMap.entries()).map(([date, data]) => ({ date, ...data })),
    },
  };
}

// ---------------------------------------------------------------------------
// Health check — direct binding checks
// ---------------------------------------------------------------------------

interface ComponentHealth {
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  error?: string;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: { d1: ComponentHealth; kv: ComponentHealth; r2: ComponentHealth };
  version: string;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const timestamp = new Date().toISOString();
  const components: SystemHealth["components"] = {
    d1: { status: "down", latencyMs: 0 },
    kv: { status: "down", latencyMs: 0 },
    r2: { status: "down", latencyMs: 0 },
  };

  const d1Start = Date.now();
  try {
    const db = getDB();
    await db.run(sql`SELECT 1`);
    components.d1 = { status: "ok", latencyMs: Date.now() - d1Start };
  } catch (err) {
    components.d1 = { status: "down", latencyMs: Date.now() - d1Start, error: err instanceof Error ? err.message : "D1 unreachable" };
  }

  const kvStart = Date.now();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const kv = env.APP_KV as KVNamespace | undefined;
    if (!kv) throw new Error("APP_KV binding not available");
    const canary = Date.now().toString();
    await kv.put("_admin_health_check", canary, { expirationTtl: 60 });
    const readBack = await kv.get("_admin_health_check");
    await kv.delete("_admin_health_check");
    if (readBack !== canary) throw new Error("KV read-back mismatch");
    components.kv = { status: "ok", latencyMs: Date.now() - kvStart };
  } catch (err) {
    components.kv = { status: "down", latencyMs: Date.now() - kvStart, error: err instanceof Error ? err.message : "KV unreachable" };
  }

  const r2Start = Date.now();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const r2 = env.R2 as R2Bucket | undefined;
    if (!r2) throw new Error("R2 binding not available");
    await r2.list({ limit: 1 });
    components.r2 = { status: "ok", latencyMs: Date.now() - r2Start };
  } catch (err) {
    components.r2 = { status: "down", latencyMs: Date.now() - r2Start, error: err instanceof Error ? err.message : "R2 unreachable" };
  }

  const statuses = Object.values(components).map((c) => c.status);
  let overallStatus: SystemHealth["status"] = "healthy";
  if (statuses.includes("down")) {
    overallStatus = statuses.every((s) => s === "down") ? "unhealthy" : "degraded";
  }

  return { status: overallStatus, timestamp, components, version: typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_APP_VERSION ?? "dev") : "dev" };
}

// ---------------------------------------------------------------------------
// Usage metrics — aggregate today & this month from KV
// ---------------------------------------------------------------------------

export interface UsageMetrics {
  today: Record<string, number>;
  thisMonth: Record<string, number>;
}

export async function getUsageMetrics(): Promise<UsageMetrics> {
  const today: Record<string, number> = {};
  const thisMonth: Record<string, number> = {};

  let kv: KVNamespace | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    kv = env.APP_KV as KVNamespace | undefined;
  } catch { return { today, thisMonth }; }
  if (!kv) return { today, thisMonth };

  const now = new Date();
  const dayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);
  const events = Object.values(USAGE_EVENTS);

  await Promise.all(
    events.map(async (event) => {
      try {
        const list = await kv!.list({ prefix: `usage:${event}:` });
        let dailyTotal = 0;
        let monthlyTotal = 0;
        for (const key of list.keys) {
          if (key.name.endsWith(`:${dayStr}`)) {
            const val = (await kv!.get(key.name, "json")) as number | null;
            dailyTotal += val ?? 0;
          }
          if (key.name.endsWith(`:${monthStr}`)) {
            const val = (await kv!.get(key.name, "json")) as number | null;
            monthlyTotal += val ?? 0;
          }
        }
        today[event] = dailyTotal;
        thisMonth[event] = monthlyTotal;
      } catch {
        today[event] = 0;
        thisMonth[event] = 0;
      }
    })
  );

  return { today, thisMonth };
}
