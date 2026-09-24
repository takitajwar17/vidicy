import { MARKETING_SEQUENCE } from "@/db/schema";

export const MARKETING_TOPIC = {
  ONBOARDING: "onboarding",
  POST_PURCHASE: "post-purchase",
  WINBACK: "win-back",
} as const;

export type MarketingTopic = (typeof MARKETING_TOPIC)[keyof typeof MARKETING_TOPIC];
export type MarketingSequenceKey = (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
export type MarketingSequenceScope = "user" | "application";

export interface MarketingSequenceStepDefinition {
  stepKey: string;
  delayMs: number;
  topic: MarketingTopic;
  templateKey: string;
  scope: MarketingSequenceScope;
}

const day = (days: number) => days * 24 * 60 * 60 * 1000;

export const MARKETING_SEQUENCE_DEFINITIONS: Record<MarketingSequenceKey, MarketingSequenceStepDefinition[]> = {
  [MARKETING_SEQUENCE.ONBOARDING]: [
    {
      stepKey: "welcome_first_step",
      delayMs: 0,
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_1",
      scope: "user",
    },
    {
      stepKey: "quick_win_checklist",
      delayMs: day(1),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_2",
      scope: "user",
    },
    {
      stepKey: "founder_story",
      delayMs: day(3),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_3",
      scope: "user",
    },
    {
      stepKey: "social_proof",
      delayMs: day(5),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_4",
      scope: "user",
    },
    {
      stepKey: "objection_ai_vs_consultant",
      delayMs: day(7),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_5",
      scope: "user",
    },
    {
      stepKey: "atlas_feature_highlight",
      delayMs: day(10),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_6",
      scope: "user",
    },
    {
      stepKey: "conversion_push",
      delayMs: day(14),
      topic: MARKETING_TOPIC.ONBOARDING,
      templateKey: "onboarding_email_7",
      scope: "user",
    },
  ],
  [MARKETING_SEQUENCE.POST_PURCHASE]: [
    {
      stepKey: "purchase_confirmation",
      delayMs: 0,
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_1",
      scope: "application",
    },
    {
      stepKey: "upload_or_evaluate_nudge",
      delayMs: day(1),
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_2",
      scope: "application",
    },
    {
      stepKey: "ai_checks_education",
      delayMs: day(3),
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_3",
      scope: "application",
    },
    {
      stepKey: "evaluation_debrief",
      delayMs: day(5),
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_4",
      scope: "application",
    },
    {
      stepKey: "round_two_push",
      delayMs: day(10),
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_5",
      scope: "application",
    },
    {
      stepKey: "final_check_in",
      delayMs: day(21),
      topic: MARKETING_TOPIC.POST_PURCHASE,
      templateKey: "post_purchase_email_6",
      scope: "application",
    },
  ],
  [MARKETING_SEQUENCE.WINBACK]: [
    {
      stepKey: "soft_check_in",
      delayMs: day(15),
      topic: MARKETING_TOPIC.WINBACK,
      templateKey: "winback_email_1",
      scope: "user",
    },
    {
      stepKey: "cost_of_rejection",
      delayMs: day(20),
      topic: MARKETING_TOPIC.WINBACK,
      templateKey: "winback_email_2",
      scope: "user",
    },
    {
      stepKey: "discount_offer",
      delayMs: day(27),
      topic: MARKETING_TOPIC.WINBACK,
      templateKey: "winback_email_3",
      scope: "user",
    },
    {
      stepKey: "discount_last_chance",
      delayMs: day(35),
      topic: MARKETING_TOPIC.WINBACK,
      templateKey: "winback_email_4",
      scope: "user",
    },
    {
      stepKey: "clean_break",
      delayMs: day(45),
      topic: MARKETING_TOPIC.WINBACK,
      templateKey: "winback_email_5",
      scope: "user",
    },
  ],
};
