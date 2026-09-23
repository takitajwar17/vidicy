export interface SubprocessorEntry {
  name: string;
  purpose: string;
  location: string;
  website: string;
}

export const SUBPROCESSORS_LAST_UPDATED = "October 7, 2026";

export const SUBPROCESSORS: SubprocessorEntry[] = [
  {
    name: "OpenAI",
    purpose: "AI processing services",
    location: "United States",
    website: "https://openai.com",
  },
  {
    name: "Perplexity",
    purpose: "AI processing services",
    location: "United States",
    website: "https://www.perplexity.ai/",
  },
  {
    name: "Cloudflare",
    purpose: "Infrastructure, security, and performance services",
    location: "Global",
    website: "https://www.cloudflare.com/",
  },
  {
    name: "Stripe",
    purpose: "Payment and billing services",
    location: "United States",
    website: "https://stripe.com",
  },
  {
    name: "Resend",
    purpose: "Email delivery services",
    location: "United States",
    website: "https://resend.com",
  },
  {
    name: "Google",
    purpose: "Authentication services",
    location: "United States",
    website: "https://google.com",
  },
  {
    name: "Sentry",
    purpose: "Application monitoring services",
    location: "United States",
    website: "https://sentry.io/welcome/",
  },
  {
    name: "Debounce",
    purpose: "Email verification services",
    location: "Global",
    website: "https://debounce.io",
  },
  {
    name: "Mailcheck.ai",
    purpose: "Email validation services",
    location: "Global",
    website: "https://www.usercheck.com/?ref=mailcheck",
  },
];
