import { SITE_URL } from "@/constants";
import { MARKETING_SEQUENCE } from "@/db/schema";
import { onboardingEmail1Text } from "@/react-email/lifecycle/onboarding-email-1";
import { onboardingEmail2Text } from "@/react-email/lifecycle/onboarding-email-2";
import { onboardingEmail3Text } from "@/react-email/lifecycle/onboarding-email-3";
import { onboardingEmail4Text } from "@/react-email/lifecycle/onboarding-email-4";
import { onboardingEmail5Text } from "@/react-email/lifecycle/onboarding-email-5";
import { onboardingEmail6Text } from "@/react-email/lifecycle/onboarding-email-6";
import { onboardingEmail7Text } from "@/react-email/lifecycle/onboarding-email-7";
import { postPurchaseEmail1Text } from "@/react-email/lifecycle/post-purchase-email-1";
import { postPurchaseEmail2Text } from "@/react-email/lifecycle/post-purchase-email-2";
import { postPurchaseEmail3Text } from "@/react-email/lifecycle/post-purchase-email-3";
import { postPurchaseEmail4aText } from "@/react-email/lifecycle/post-purchase-email-4a";
import { postPurchaseEmail4bText } from "@/react-email/lifecycle/post-purchase-email-4b";
import { postPurchaseEmail5Text } from "@/react-email/lifecycle/post-purchase-email-5";
import { postPurchaseEmail6Text } from "@/react-email/lifecycle/post-purchase-email-6";
import { winbackEmail1Text } from "@/react-email/lifecycle/winback-email-1";
import { winbackEmail2Text } from "@/react-email/lifecycle/winback-email-2";
import { winbackEmail3Text } from "@/react-email/lifecycle/winback-email-3";
import { winbackEmail4Text } from "@/react-email/lifecycle/winback-email-4";
import { winbackEmail5Text } from "@/react-email/lifecycle/winback-email-5";

import { MARKETING_SEQUENCE_DEFINITIONS } from "./sequence-definitions";

const UNSUBSCRIBE_FOOTER = "\n\nManage email preferences: {{{RESEND_UNSUBSCRIBE_URL}}}";

interface LifecycleRenderState {
  latestApplicationId?: string | null;
  applicationId?: string | null;
  hasApplication?: boolean;
  hasUploadedDocuments?: boolean;
  hasEvaluation?: boolean;
  hasPaid?: boolean;
  riskLevel?: string | null;
}

interface LifecycleRenderParams {
  sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
  stepKey: string;
  firstName: string;
  applicationId?: string | null;
  lifecycleState?: LifecycleRenderState;
  now?: Date;
}

export function renderLifecycleEmail({
  sequence,
  stepKey,
  firstName,
  applicationId,
  lifecycleState,
  now = new Date(),
}: LifecycleRenderParams) {
  const definition = MARKETING_SEQUENCE_DEFINITIONS[sequence].find((step) => step.stepKey === stepKey);

  if (!definition) {
    throw new Error(`Unknown lifecycle step "${stepKey}" for sequence "${sequence}"`);
  }

  const dashboardUrl = `${SITE_URL}/dashboard`;
  const resolvedApplicationId =
    applicationId
    ?? lifecycleState?.applicationId
    ?? lifecycleState?.latestApplicationId
    ?? null;
  const checklistUrl = resolvedApplicationId ? `${SITE_URL}/dashboard/${resolvedApplicationId}/checklist` : dashboardUrl;
  const evaluationUrl = resolvedApplicationId ? `${SITE_URL}/dashboard/${resolvedApplicationId}/evaluation` : dashboardUrl;
  const atlasUrl = resolvedApplicationId ? `${SITE_URL}/dashboard/${resolvedApplicationId}/atlas` : dashboardUrl;
  const comebackExpiryDate = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000))
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  switch (definition.templateKey) {
    case "onboarding_email_1":
      return {
        subject: "Welcome to Vidicy — your first step takes 60 seconds",
        text: onboardingEmail1Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_2":
      return {
        subject: "Your embassy-specific checklist is waiting",
        text: onboardingEmail2Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_3":
      return {
        subject: "A small visa mistake can get expensive fast",
        text: onboardingEmail3Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_4":
      return {
        subject: "The issues most applicants miss are the quiet ones",
        text: onboardingEmail4Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_5":
      return {
        subject: "Can AI really help with visa documents?",
        text: onboardingEmail5Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_6":
      return {
        subject: "Meet Atlas — your visa workspace assistant",
        text: onboardingEmail6Text({
          firstName,
          atlasUrl,
          checklistUrl,
          hasUploadedDocuments: Boolean(lifecycleState?.hasUploadedDocuments),
        }) + UNSUBSCRIBE_FOOTER,
      };
    case "onboarding_email_7":
      return {
        subject: "Your application will not review itself",
        text: onboardingEmail7Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_1":
      return {
        subject: "You're in — here's your next step",
        text: postPurchaseEmail1Text({ firstName, checklistUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_2":
      if (lifecycleState?.hasUploadedDocuments) {
        return {
          subject: "Your documents are uploaded — run your evaluation",
          text: postPurchaseEmail2Text({ firstName, checklistUrl, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
        };
      }
      return {
        subject: "Your visa review is waiting",
        text: postPurchaseEmail2Text({ firstName, checklistUrl, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_3":
      return {
        subject: "The 5 things the AI checks that humans miss",
        text: postPurchaseEmail3Text({ firstName, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_4":
      if (lifecycleState?.hasEvaluation) {
        return {
          subject: "Your risk score is in — here is how to improve it",
          text: postPurchaseEmail4aText({ firstName, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
        };
      }

      return {
        subject: "Your evaluation is still waiting",
        text: postPurchaseEmail4bText({ firstName, checklistUrl, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_5":
      return {
        subject: "Time for round 2",
        text: postPurchaseEmail5Text({ firstName, evaluationUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "post_purchase_email_6":
      return {
        subject: "Final check-in before this sequence ends",
        text: postPurchaseEmail6Text({ firstName, checklistUrl, atlasUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "winback_email_1":
      return {
        subject: `Quick question, ${firstName}`,
        text: winbackEmail1Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "winback_email_2":
      return {
        subject: "What a visa rejection actually costs you",
        text: winbackEmail2Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "winback_email_3":
      return {
        subject: "20% off if you want to come back",
        text: winbackEmail3Text({ firstName, dashboardUrl, expiryDate: comebackExpiryDate }) + UNSUBSCRIBE_FOOTER,
      };
    case "winback_email_4":
      return {
        subject: "Your 20% off expires in 48 hours",
        text: winbackEmail4Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    case "winback_email_5":
      return {
        subject: "Should I stop emailing you?",
        text: winbackEmail5Text({ firstName, dashboardUrl }) + UNSUBSCRIBE_FOOTER,
      };
    default:
      throw new Error(`No renderer for lifecycle template "${definition.templateKey}"`);
  }
}
