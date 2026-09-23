import "server-only";

import { cache } from "react";
import { getDB } from "@/db";
import { getSessionFromCookie, requireAdmin } from "@/utils/auth";
import {
  supportTicketTable,
  supportMessageTable,
  SUPPORT_TICKET_STATUS,
  userTable,
} from "@/db/schema";
import { eq, desc, asc, and, inArray, count, or, gt, isNull, isNotNull } from "drizzle-orm";
import { sendSupportTicketAdminNotification, sendSupportTicketReplyNotification, sendSupportTicketUserReplyNotification } from "@/utils/email";
import { deleteFromR2, getR2Bucket } from "@/lib/r2";
import { logger } from "@/infra/logger";
import { ZSAError } from "zsa";
import { SUPPORT_TICKETS_PER_PAGE } from "@/constants";
import { invalidateUnreadCount, invalidateAdminUnreadCount } from "@/server/unread-counts";
import { sendEmailBestEffort } from "@/lib/best-effort-email";

export async function submitSupportTicket({
  subject,
  description,
  category,
  screenshotUrls,
  userAgent,
  ipAddress,
}: {
  subject: string;
  description: string;
  category: string;
  screenshotUrls?: string[];
  userAgent?: string;
  ipAddress?: string;
}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be signed in to submit a support ticket");

  const db = getDB();

  const [ticket] = await db
    .insert(supportTicketTable)
    .values({
      userId: session.user.id,
      subject,
      description,
      category,
      screenshotUrls: screenshotUrls && screenshotUrls.length > 0 ? screenshotUrls : null,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      lastUpdatedAt: new Date(),
      lastViewedAt: new Date(),
    })
    .returning();

  await invalidateAdminUnreadCount();

  const userName = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || session.user.email || 'User';

  // Send admin notification (non-fatal)
  await sendEmailBestEffort({
    send: () => sendSupportTicketAdminNotification({
      ticketId: ticket.id,
      subject,
      category,
      description,
      userName,
      userEmail: session.user.email || '',
    }),
    logger,
    message: "Failed to send support ticket admin notification",
    context: {
      ticketId: ticket.id,
      userId: session.user.id,
      category,
    },
  });

  return ticket;
}

interface SupportTicketMessageSummary {
  lastMessageContent: string | null;
  lastMessageIsAdminReply: boolean | null;
  lastMessageIsSystemMessage: boolean | null;
  messageSearchText: string;
}

function getEmptySupportTicketMessageSummary(): SupportTicketMessageSummary {
  return {
    lastMessageContent: null,
    lastMessageIsAdminReply: null,
    lastMessageIsSystemMessage: null,
    messageSearchText: "",
  };
}

async function getSupportTicketMessageSummaryMap({
  ticketIds,
}: {
  ticketIds: string[];
}) {
  if (ticketIds.length === 0) {
    return new Map<string, SupportTicketMessageSummary>();
  }

  const db = getDB();
  const messages = await db.query.supportMessageTable.findMany({
    where: inArray(supportMessageTable.ticketId, ticketIds),
    columns: {
      ticketId: true,
      content: true,
      isAdminReply: true,
      isSystemMessage: true,
    },
    orderBy: [desc(supportMessageTable.createdAt)],
  });

  const messageSummaryMap = new Map<
    string,
    SupportTicketMessageSummary & { messageContents: string[] }
  >();

  for (const message of messages) {
    const existingSummary = messageSummaryMap.get(message.ticketId);

    if (existingSummary) {
      existingSummary.messageContents.push(message.content);
      continue;
    }

    messageSummaryMap.set(message.ticketId, {
      lastMessageContent: message.content,
      lastMessageIsAdminReply: message.isAdminReply,
      lastMessageIsSystemMessage: message.isSystemMessage,
      messageSearchText: "",
      messageContents: [message.content],
    });
  }

  return new Map(
    ticketIds.map((ticketId) => {
      const messageSummary = messageSummaryMap.get(ticketId);

      if (!messageSummary) {
        return [ticketId, getEmptySupportTicketMessageSummary()] as const;
      }

      return [
        ticketId,
        {
          lastMessageContent: messageSummary.lastMessageContent,
          lastMessageIsAdminReply: messageSummary.lastMessageIsAdminReply,
          lastMessageIsSystemMessage: messageSummary.lastMessageIsSystemMessage,
          messageSearchText: messageSummary.messageContents.join("\n"),
        },
      ] as const;
    }),
  );
}

export async function getUserSupportTicketSummaries({
  page = 1,
}: {
  page?: number;
} = {}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be signed in");

  const db = getDB();
  const offset = (page - 1) * SUPPORT_TICKETS_PER_PAGE;

  const [tickets, [countResult]] = await Promise.all([
    db.query.supportTicketTable.findMany({
      where: eq(supportTicketTable.userId, session.user.id),
      orderBy: [desc(supportTicketTable.lastUpdatedAt)],
      limit: SUPPORT_TICKETS_PER_PAGE,
      offset,
    }),
    db
      .select({ total: count() })
      .from(supportTicketTable)
      .where(eq(supportTicketTable.userId, session.user.id)),
  ]);

  const messageSummaryMap = await getSupportTicketMessageSummaryMap({
    ticketIds: tickets.map((ticket) => ticket.id),
  });

  return {
    tickets: tickets.map((ticket) => ({
      ...ticket,
      ...(messageSummaryMap.get(ticket.id) ?? getEmptySupportTicketMessageSummary()),
    })),
    totalCount: countResult?.total ?? 0,
  };
}

export async function getUserSupportTickets({ page = 1 }: { page?: number } = {}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be signed in");

  const db = getDB();
  const offset = (page - 1) * SUPPORT_TICKETS_PER_PAGE;

  const [tickets, [countResult]] = await Promise.all([
    db.query.supportTicketTable.findMany({
      where: eq(supportTicketTable.userId, session.user.id),
      orderBy: [desc(supportTicketTable.lastUpdatedAt)],
      limit: SUPPORT_TICKETS_PER_PAGE,
      offset,
      with: {
        messages: {
          orderBy: [asc(supportMessageTable.createdAt)],
        }
      }
    }),
    db
      .select({ total: count() })
      .from(supportTicketTable)
      .where(eq(supportTicketTable.userId, session.user.id)),
  ]);

  return {
    tickets,
    totalCount: countResult?.total ?? 0,
  };
}

export async function getSupportTicketById({ ticketId }: { ticketId: string }) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be signed in");

  const db = getDB();
  const isAdmin = session.user.role === 'admin';

  const ticket = await db.query.supportTicketTable.findFirst({
    where: isAdmin
      ? eq(supportTicketTable.id, ticketId)
      : and(eq(supportTicketTable.id, ticketId), eq(supportTicketTable.userId, session.user.id)),
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
      messages: {
        orderBy: [desc(supportMessageTable.createdAt)],
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            }
          }
        }
      }
    }
  });

  if (!ticket) throw new ZSAError("NOT_FOUND", "Ticket not found");

  return {
    ...ticket,
    userFirstName: ticket.user?.firstName ?? null,
    userLastName: ticket.user?.lastName ?? null,
    userEmail: ticket.user?.email ?? null,
    userAvatar: ticket.user?.avatar ?? null,
  };
}

export async function getAllSupportTicketSummaries({
  status,
  category,
  page = 1,
}: {
  status?: string;
  category?: string;
  page?: number;
}) {
  await requireAdmin();
  const db = getDB();

  const offset = (page - 1) * SUPPORT_TICKETS_PER_PAGE;

  const conditions = [];
  if (status) conditions.push(eq(supportTicketTable.status, status));
  if (category) conditions.push(eq(supportTicketTable.category, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [tickets, [countResult]] = await Promise.all([
    db
      .select({
        id: supportTicketTable.id,
        subject: supportTicketTable.subject,
        category: supportTicketTable.category,
        status: supportTicketTable.status,
        priority: supportTicketTable.priority,
        description: supportTicketTable.description,
        screenshotUrls: supportTicketTable.screenshotUrls,
        adminNote: supportTicketTable.adminNote,
        resolvedAt: supportTicketTable.resolvedAt,
        lastViewedAt: supportTicketTable.lastViewedAt,
        adminLastViewedAt: supportTicketTable.adminLastViewedAt,
        lastUpdatedAt: supportTicketTable.lastUpdatedAt,
        userAgent: supportTicketTable.userAgent,
        ipAddress: supportTicketTable.ipAddress,
        createdAt: supportTicketTable.createdAt,
        updatedAt: supportTicketTable.updatedAt,
        userId: supportTicketTable.userId,
        userFirstName: userTable.firstName,
        userLastName: userTable.lastName,
        userEmail: userTable.email,
        userAvatar: userTable.avatar,
      })
      .from(supportTicketTable)
      .leftJoin(userTable, eq(supportTicketTable.userId, userTable.id))
      .where(whereClause)
      .orderBy(desc(supportTicketTable.lastUpdatedAt))
      .limit(SUPPORT_TICKETS_PER_PAGE)
      .offset(offset),
    db
      .select({ total: count() })
      .from(supportTicketTable)
      .where(whereClause),
  ]);

  const messageSummaryMap = await getSupportTicketMessageSummaryMap({
    ticketIds: tickets.map((ticket) => ticket.id),
  });

  return {
    tickets: tickets.map((ticket) => ({
      ...ticket,
      ...(messageSummaryMap.get(ticket.id) ?? getEmptySupportTicketMessageSummary()),
    })),
    totalCount: countResult?.total ?? 0,
  };
}

export async function getAllSupportTickets({
  status,
  category,
  page = 1,
}: {
  status?: string;
  category?: string;
  page?: number;
}) {
  await requireAdmin();
  const db = getDB();

  const offset = (page - 1) * SUPPORT_TICKETS_PER_PAGE;

  const conditions = [];
  if (status) conditions.push(eq(supportTicketTable.status, status));
  if (category) conditions.push(eq(supportTicketTable.category, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [tickets, [countResult]] = await Promise.all([
    db
      .select({
        id: supportTicketTable.id,
        subject: supportTicketTable.subject,
        category: supportTicketTable.category,
        status: supportTicketTable.status,
        priority: supportTicketTable.priority,
        description: supportTicketTable.description,
        screenshotUrls: supportTicketTable.screenshotUrls,
        adminNote: supportTicketTable.adminNote,
        resolvedAt: supportTicketTable.resolvedAt,
        lastViewedAt: supportTicketTable.lastViewedAt,
        adminLastViewedAt: supportTicketTable.adminLastViewedAt,
        lastUpdatedAt: supportTicketTable.lastUpdatedAt,
        userAgent: supportTicketTable.userAgent,
        ipAddress: supportTicketTable.ipAddress,
        createdAt: supportTicketTable.createdAt,
        updatedAt: supportTicketTable.updatedAt,
        userId: supportTicketTable.userId,
        userFirstName: userTable.firstName,
        userLastName: userTable.lastName,
        userEmail: userTable.email,
        userAvatar: userTable.avatar,
      })
      .from(supportTicketTable)
      .leftJoin(userTable, eq(supportTicketTable.userId, userTable.id))
      .where(whereClause)
      .orderBy(desc(supportTicketTable.lastUpdatedAt))
      .limit(SUPPORT_TICKETS_PER_PAGE)
      .offset(offset),
    db
      .select({ total: count() })
      .from(supportTicketTable)
      .where(whereClause),
  ]);

  // Fetch messages for each ticket (depends on ticket IDs from above)
  const ticketIds = tickets.map(t => t.id);
  const messages = ticketIds.length > 0
    ? await db.query.supportMessageTable.findMany({
      where: inArray(supportMessageTable.ticketId, ticketIds),
      orderBy: [desc(supportMessageTable.createdAt)],
    })
    : [];

  return {
    tickets: tickets.map(t => ({
      ...t,
      messages: messages.filter(m => m.ticketId === t.id),
    })),
    totalCount: countResult?.total ?? 0,
  };
}

export async function updateTicketStatus({
  ticketId,
  status,
  priority,
  category,
  adminNote,
}: {
  ticketId: string;
  status?: string;
  priority?: string;
  category?: string;
  adminNote?: string;
}) {
  await requireAdmin();
  const db = getDB();

  const existing = await db.query.supportTicketTable.findFirst({
    where: eq(supportTicketTable.id, ticketId),
  });
  if (!existing) throw new ZSAError("NOT_FOUND", "Ticket not found");

  const now = new Date();
  const isResolved = status === SUPPORT_TICKET_STATUS.RESOLVED || status === SUPPORT_TICKET_STATUS.CLOSED;

  const updateValues: Partial<typeof supportTicketTable.$inferInsert> = {};
  if (status) updateValues.status = status;
  if (priority) updateValues.priority = priority;
  if (category) updateValues.category = category;
  if (adminNote !== undefined) updateValues.adminNote = adminNote;
  if (isResolved && !existing.resolvedAt) {
    updateValues.resolvedAt = now;
  }

  const statusChanged = status && status !== existing.status;
  const categoryChanged = category && category !== existing.category;
  const priorityChanged = priority && priority !== existing.priority;

  if (statusChanged || categoryChanged || priorityChanged) {
    updateValues.lastUpdatedAt = now;
  }

  // Create system messages for changes
  const session = await getSessionFromCookie();
  const currentUserId = session?.user?.id || existing.userId!;

  if (categoryChanged) {
    await db.insert(supportMessageTable).values({
      ticketId,
      userId: currentUserId,
      content: `Category updated to ${category.replace(/_/g, ' ')}`,
      isSystemMessage: true,
    });
  }

  if (statusChanged) {
    await db.insert(supportMessageTable).values({
      ticketId,
      userId: currentUserId,
      content: `Status updated to ${status.replace(/_/g, ' ')}`,
      isSystemMessage: true,
    });
  }

  if (priorityChanged && priority === 'high') {
    await db.insert(supportMessageTable).values({
      ticketId,
      userId: currentUserId,
      content: `Priority updated to ${priority}`,
      isSystemMessage: true,
    });
  }

  const [updated] = await db
    .update(supportTicketTable)
    .set(updateValues)
    .where(eq(supportTicketTable.id, ticketId))
    .returning();

  if (statusChanged || categoryChanged || priorityChanged) {
    await Promise.all([
      invalidateAdminUnreadCount(),
      existing.userId ? invalidateUnreadCount(existing.userId) : Promise.resolve(),
    ]);
  }

  return updated;
}

export async function deleteTicket({ ticketId }: { ticketId: string }) {
  await requireAdmin();
  const db = getDB();

  const existing = await db.query.supportTicketTable.findFirst({
    where: eq(supportTicketTable.id, ticketId),
  });
  if (!existing) throw new ZSAError("NOT_FOUND", "Ticket not found");

  // Collect all screenshot R2 keys from ticket and its messages
  const messages = await db.query.supportMessageTable.findMany({
    where: eq(supportMessageTable.ticketId, ticketId),
    columns: { screenshotUrls: true },
  });

  const r2Keys: string[] = [
    ...(existing.screenshotUrls ?? []),
    ...messages.flatMap(m => m.screenshotUrls ?? []),
  ];

  await db.delete(supportTicketTable).where(eq(supportTicketTable.id, ticketId));

  // Clean up R2 objects (non-fatal — DB record is already deleted)
  if (r2Keys.length > 0) {
    try {
      const r2 = await getR2Bucket();
      await deleteFromR2(r2, r2Keys);
    } catch (cleanupError) {
      logger.error("R2 cleanup failed for support ticket screenshots — orphaned files may remain", { ticketId, r2Keys, cleanupError });
    }
  }
}

export const getAdminUnreadSupportTicketsCount = cache(async function getAdminUnreadSupportTicketsCount() {
  const db = getDB();

  const [result] = await db
    .select({ total: count() })
    .from(supportTicketTable)
    .where(
      and(
        isNotNull(supportTicketTable.lastUpdatedAt),
        or(
          isNull(supportTicketTable.adminLastViewedAt),
          gt(supportTicketTable.lastUpdatedAt, supportTicketTable.adminLastViewedAt)
        )
      )
    );

  return result?.total ?? 0;
});

export const getUnreadSupportTicketsCount = cache(async function getUnreadSupportTicketsCount(userId?: string) {
  let targetUserId = userId;

  if (!targetUserId) {
    const session = await getSessionFromCookie();
    if (!session) return 0;
    targetUserId = session.user.id;
  }

  const db = getDB();

  const [result] = await db
    .select({ total: count() })
    .from(supportTicketTable)
    .where(
      and(
        eq(supportTicketTable.userId, targetUserId),
        isNotNull(supportTicketTable.lastUpdatedAt),
        or(
          isNull(supportTicketTable.lastViewedAt),
          gt(supportTicketTable.lastUpdatedAt, supportTicketTable.lastViewedAt)
        )
      )
    );

  return result?.total ?? 0;
});

export async function markTicketAsViewed({ ticketId }: { ticketId: string }) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");

  const db = getDB();

  await db.update(supportTicketTable)
    .set({ lastViewedAt: new Date() })
    .where(and(
      eq(supportTicketTable.id, ticketId),
      eq(supportTicketTable.userId, session.user.id)
    ));

  await invalidateUnreadCount(session.user.id);
}

export async function markTicketAsViewedByAdmin({ ticketId }: { ticketId: string }) {
  await requireAdmin();
  const db = getDB();

  await db.update(supportTicketTable)
    .set({ adminLastViewedAt: new Date() })
    .where(eq(supportTicketTable.id, ticketId));

  await invalidateAdminUnreadCount();
}

export async function addSupportMessage({
  ticketId,
  content,
  isAdminReply = false,
  screenshotUrls,
}: {
  ticketId: string;
  content: string;
  isAdminReply?: boolean;
  screenshotUrls?: string[];
}) {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");

  const db = getDB();
  const isAdmin = session.user.role === 'admin';

  // Security check: ensure user owns ticket OR is admin
  const ticket = await db.query.supportTicketTable.findFirst({
    where: isAdmin
      ? eq(supportTicketTable.id, ticketId)
      : and(eq(supportTicketTable.id, ticketId), eq(supportTicketTable.userId, session.user.id)),
  });

  if (!ticket) throw new ZSAError("NOT_FOUND", "Ticket not found");

  // Block replies on resolved or closed tickets
  if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED || ticket.status === SUPPORT_TICKET_STATUS.CLOSED) {
    if (!isAdmin) {
      throw new ZSAError("PRECONDITION_FAILED", "This ticket is resolved. Please open a new ticket if you need further help.");
    }
  }

  const [message] = await db
    .insert(supportMessageTable)
    .values({
      ticketId,
      userId: session.user.id,
      content,
      isAdminReply: isAdmin && isAdminReply,
      screenshotUrls: screenshotUrls && screenshotUrls.length > 0 ? screenshotUrls : null,
    })
    .returning();

  // Update ticket's lastUpdatedAt and lastViewedAt accordingly
  const now = new Date();
  const updateValues: Partial<typeof supportTicketTable.$inferInsert> = {
    lastUpdatedAt: now,
  };

  if (!isAdmin) {
    // If user replies, mark as viewed by user
    updateValues.lastViewedAt = now;
  } else {
    // If admin replies, mark as viewed by admin
    updateValues.adminLastViewedAt = now;
  }

  await db
    .update(supportTicketTable)
    .set(updateValues)
    .where(eq(supportTicketTable.id, ticketId));

  // Invalidate cached unread counts for affected parties
  if (isAdmin) {
    // Admin replied → user gets new unread
    await invalidateUnreadCount(ticket.userId!);
  } else {
    // User replied → admin gets new unread
    await invalidateAdminUnreadCount();
  }

  // If admin replies, notify user; if user replies, notify admin
  if (isAdmin && isAdminReply) {
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, ticket.userId!),
      columns: { email: true, firstName: true, lastName: true },
    });
    if (user?.email) {
      const userEmail = user.email;
      const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      await sendEmailBestEffort({
        send: () => sendSupportTicketReplyNotification({
          ticketId,
          userEmail,
          userName,
          subject: ticket.subject,
          status: ticket.status,
          adminReply: content,
        }),
        logger,
        message: "Failed to send support ticket reply notification",
        context: {
          ticketId,
          userId: ticket.userId,
          email: userEmail,
        },
      });
    }
  } else if (!isAdmin) {
    // User replied — notify admin
    const senderName = [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') || session.user.email || "User";
    await sendEmailBestEffort({
      send: () => sendSupportTicketUserReplyNotification({
        ticketId,
        subject: ticket.subject,
        category: ticket.category,
        userName: senderName,
        userEmail: session.user.email ?? "",
        messageContent: content,
      }),
      logger,
      message: "Failed to send support ticket user reply notification",
      context: {
        ticketId,
        userId: session.user.id,
      },
    });
  }

  return message;
}
