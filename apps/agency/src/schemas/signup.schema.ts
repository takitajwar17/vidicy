import { z } from "zod"
import { captchaSchema } from "./captcha.schema";

export const signUpSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(2).max(255),
  lastName: z.string().min(2).max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms of Service and Privacy Policy" }),
  }),
  captchaToken: captchaSchema,
  csrfToken: z.string().optional(),
})

export type SignUpSchema = z.infer<typeof signUpSchema>
