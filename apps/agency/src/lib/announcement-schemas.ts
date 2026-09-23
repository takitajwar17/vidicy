import { z } from "zod";

import { getAnnouncementEmbed } from "@/lib/announcements";

export const announcementAttachmentSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().max(2048).url(),
});

export const announcementCtaSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().max(2048).url(),
});

export const announcementEmbedSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional().nullable(),
    url: z.string().trim().max(2048).url(),
  })
  .superRefine((value, context) => {
    if (!getAnnouncementEmbed(value.url)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported embed URL",
        path: ["url"],
      });
    }
  });

export const announcementCreateInputSchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    body: z.string().trim().min(3).max(20000),
    type: z.enum([
      "announcement",
      "release_note",
      "maintenance",
      "poll",
      "event",
      "action_required",
    ]),
    priority: z.enum(["normal", "important", "critical"]),
    pinned: z.boolean().optional(),
    commentsEnabled: z.boolean().optional(),
    pollSingleChoice: z.boolean().optional(),
    pollNamedVotes: z.boolean().optional(),
    pollAllowVoteChange: z.boolean().optional(),
    pollCloseAt: z.coerce.date().optional().nullable(),
    pollOptions: z.array(z.string().trim().min(1).max(255)).max(12).optional(),
    sendEmail: z.boolean().optional(),
    attachments: z.array(announcementAttachmentSchema).max(6).optional(),
    cta: announcementCtaSchema.optional().nullable(),
    embed: announcementEmbedSchema.optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.type === "poll" && (!value.pollOptions || value.pollOptions.length < 2)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Polls require at least two options",
        path: ["pollOptions"],
      });
    }
  });
