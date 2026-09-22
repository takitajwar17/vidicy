"use server";

import { createServerAction } from "zsa";
import { z } from "zod";
import {
  addAnnouncementComment,
  createAnnouncement,
  deleteAnnouncementComment,
  getAnnouncementsFeed,
  markAnnouncementRead,
  toggleAnnouncementUpvote,
  voteOnAnnouncementPoll,
} from "@/server/announcements";
import { revalidatePath } from "next/cache";
import { announcementCreateInputSchema } from "@/lib/announcement-schemas";

const feedQuerySchema = z.object({
  q: z.string().max(120).optional(),
  type: z
    .enum(["announcement", "release_note", "maintenance", "poll", "event", "action_required"])
    .optional(),
  pinnedOnly: z.boolean().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const getAnnouncementsFeedAction = createServerAction()
  .input(feedQuerySchema.optional())
  .handler(async ({ input }) => {
    return getAnnouncementsFeed(input);
  });

export const createAnnouncementAction = createServerAction()
  .input(announcementCreateInputSchema)
  .handler(async ({ input }) => {
    const result = await createAnnouncement(input);
    revalidatePath("/dashboard/announcements");
    return result;
  });

export const toggleAnnouncementUpvoteAction = createServerAction()
  .input(z.object({ postId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const result = await toggleAnnouncementUpvote(input.postId);
    revalidatePath("/dashboard/announcements");
    return result;
  });

export const addAnnouncementCommentAction = createServerAction()
  .input(
    z.object({
      postId: z.string().min(1),
      body: z.string().min(1).max(5000),
      parentId: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ input }) => {
    const result = await addAnnouncementComment(input);
    revalidatePath("/dashboard/announcements");
    return result;
  });

export const deleteAnnouncementCommentAction = createServerAction()
  .input(z.object({ commentId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const result = await deleteAnnouncementComment(input.commentId);
    revalidatePath("/dashboard/announcements");
    return result;
  });

export const voteOnAnnouncementPollAction = createServerAction()
  .input(z.object({ postId: z.string().min(1), optionIds: z.array(z.string().min(1)).max(12) }))
  .handler(async ({ input }) => {
    const result = await voteOnAnnouncementPoll(input);
    revalidatePath("/dashboard/announcements");
    return result;
  });

export const markAnnouncementReadAction = createServerAction()
  .input(z.object({ postId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const result = await markAnnouncementRead(input.postId);
    revalidatePath("/dashboard/announcements");
    return result;
  });
