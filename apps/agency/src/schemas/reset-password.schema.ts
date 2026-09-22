import { z } from "zod";

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required").max(128),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
  confirmPassword: z.string().max(256),
  csrfToken: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
