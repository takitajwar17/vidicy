"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import {
  submitSupportTicket,
  getUserSupportTicketSummaries,
  getAllSupportTicketSummaries,
  getSupportTicketById,
  updateTicketStatus,
  deleteTicket,
  markTicketAsViewed,
  markTicketAsViewedByAdmin,
  addSupportMessage,
} from "@/server/support";
import { withRateLimit } from "@/infra/with-rate-limit";
import { revalidatePath } from "next/cache";
import ms from "ms";
import { getSessionFromCookie } from "@/utils/auth";
import { headers } from "next/headers";

const submitTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(255, "Subject is too long"),
  description: z.string().min(10, "Please provide more detail").max(5000, "Description is too long"),
  category: z.enum(["bug", "feedback", "question", "feature_request", "other"]),
  screenshotUrls: z.array(z.string().min(1)).max(3).optional(),
});

export const submitSupportTicketAction = createServerAction()
  .input(submitTicketSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be signed in");

    const headersList = await headers();
    const userAgent = headersList.get("user-agent") ?? undefined;
    const ipAddress = headersList.get("cf-connecting-ip") ?? headersList.get("x-forwarded-for") ?? undefined;

    return withRateLimit(
      async () => {
        return submitSupportTicket({
          subject: input.subject,
          description: input.description,
          category: input.category,
          screenshotUrls: input.screenshotUrls,
          userAgent,
          ipAddress,
        });
      },
      {
        identifier: "support-ticket",
        userIdentifier: session.user.id,
        limit: 5,
        windowInSeconds: Math.floor(ms("1 hour") / 1000),
      }
    );
  });

export const getUserTicketsAction = createServerAction()
  .input(z.object({ page: z.number().min(1).default(1) }).default({ page: 1 }))
  .handler(async ({ input }) => {
    return getUserSupportTicketSummaries({ page: input.page });
  });

export const getSupportTicketDetailAction = createServerAction()
  .input(z.object({ ticketId: z.string().min(1, "Ticket ID is required") }))
  .handler(async ({ input }) => {
    return getSupportTicketById({ ticketId: input.ticketId });
  });

const updateTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required"),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  category: z.enum(["bug", "feedback", "question", "feature_request", "other"]).optional(),
  adminNote: z.string().max(2000).optional(),
});

export const updateTicketStatusAction = createServerAction()
  .input(updateTicketSchema)
  .handler(async ({ input }) => {
    const result = await updateTicketStatus({
      ticketId: input.ticketId,
      status: input.status,
      priority: input.priority,
      category: input.category,
      adminNote: input.adminNote,
    });
    revalidatePath("/dashboard/support");
    revalidatePath("/admin/support");
    return result;
  });

const deleteTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required"),
});

export const deleteTicketAction = createServerAction()
  .input(deleteTicketSchema)
  .handler(async ({ input }) => {
    await deleteTicket({ ticketId: input.ticketId });
    revalidatePath("/dashboard/support");
    revalidatePath("/admin/support");
  });

const getAllTicketsSchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  page: z.number().min(1).default(1),
});

export const getAllTicketsAction = createServerAction()
  .input(getAllTicketsSchema)
  .handler(async ({ input }) => {
    return getAllSupportTicketSummaries({
      status: input.status,
      category: input.category,
      page: input.page,
    });
  });

export const markTicketAsViewedAction = createServerAction()
  .input(z.object({ ticketId: z.string() }))
  .handler(async ({ input }) => {
    return markTicketAsViewed({ ticketId: input.ticketId });
  });

export const markTicketAsViewedByAdminAction = createServerAction()
  .input(z.object({ ticketId: z.string() }))
  .handler(async ({ input }) => {
    return markTicketAsViewedByAdmin({ ticketId: input.ticketId });
  });

export const addSupportMessageAction = createServerAction()
  .input(z.object({
    ticketId: z.string(),
    content: z.string().min(1, "Message cannot be empty").max(5000),
    screenshotUrls: z.array(z.string().min(1)).max(3).optional(),
    isAdminReply: z.boolean().optional().default(false),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");

    // Only allow admin to set isAdminReply to true
    const isAdmin = session.user.role === 'admin';
    const requestedAsAdmin = input.isAdminReply && isAdmin;

    return withRateLimit(
      async () => {
        return addSupportMessage({
          ticketId: input.ticketId,
          content: input.content,
          isAdminReply: requestedAsAdmin,
          screenshotUrls: input.screenshotUrls,
        });
      },
      {
        identifier: "support-message",
        userIdentifier: session.user.id,
        limit: 30,
        windowInSeconds: Math.floor(ms("1 hour") / 1000),
      }
    );
  });
