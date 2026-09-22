import { z } from "zod";

// Keep input schema environment-agnostic; server actions enforce required captcha
// when TURNSTILE_SECRET_KEY is configured.
export const captchaSchema = z.string().optional()
