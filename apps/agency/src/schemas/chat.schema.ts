import { z } from "zod";

const message = z.string().trim().max(16_000, "Message is too long");
const identifier = z.string().trim().min(1).max(128);

export const chatStreamRequestSchema = z.object({
  applicationId: identifier,
  conversationId: identifier,
  message: message.min(1, "Message is required"),
});

export const chatDocumentRequestSchema = z.object({
  applicationId: identifier,
  conversationId: identifier.nullable(),
  message: message.nullable().transform((value) => value ?? ""),
  thumbnail: z
    .string()
    .max(512_000, "Thumbnail is too large")
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Invalid thumbnail")
    .nullable(),
});
