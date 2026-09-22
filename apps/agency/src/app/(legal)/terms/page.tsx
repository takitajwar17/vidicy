import { Metadata } from "next";
import Link from "next/link";
import { CANONICAL_SITE_URL } from "@/constants";
import { siteConfig } from "@/lib/config";
import { constructMetadata } from "@/lib/utils";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import {
  FileTextIcon,
  UserIcon,
  CreditCardIcon,
  CopyrightIcon,
  BrainCircuitIcon,
  ShieldAlertIcon,
  DatabaseIcon,
  FileEditIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
} from "lucide-react";

const termsDescription =
  "Read the terms of service for Vidicy. Understand your rights, obligations, acceptable use policies, and our service limits.";

export const metadata: Metadata = constructMetadata({
  title: "Terms of service",
  description: termsDescription,
  alternates: {
    canonical: "/terms",
  },
});

const termsPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Terms of Service",
  description: termsDescription,
  url: `${CANONICAL_SITE_URL}/terms`,
  dateModified: "2026-10-02",
  isPartOf: {
    "@type": "WebSite",
    name: siteConfig.name,
    url: CANONICAL_SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: siteConfig.name,
    url: CANONICAL_SITE_URL,
  },
};

function SectionIcon({ icon: Icon }: { icon: typeof FileTextIcon }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-5 w-5 text-primary" />
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  id,
}: {
  icon: typeof FileTextIcon;
  title: string;
  id?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4" id={id}>
      <SectionIcon icon={icon} />
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckCircle2Icon className="h-4 w-4 text-primary shrink-0 mt-1" />
      <span className="text-sm text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

export default function TermsPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(termsPageSchema) }}
      />

      <PublicPageHero
        eyebrow="Legal"
        title="Terms of Service"
        meta="Last updated: October 2, 2026"
        description="Read the terms that govern Vidicy, including acceptable use, payments, AI limitations, and liability boundaries."
      />

      <PublicPageContent className="space-y-16">
        {/* 1. Acceptance of Terms */}
        <section>
          <SectionHeading icon={FileTextIcon} title="1. Acceptance of Terms" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            By accessing {siteConfig.name}, creating an account, or purchasing a subscription, you
            accept and agree to be bound by the terms and provisions of this agreement. Our platform
            leverages artificial intelligence to analyze documents for potential inconsistencies and
            risks related to visa applications.
          </p>
          <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 flex items-start gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
            <p className="text-sm text-foreground font-medium">
              CRITICAL DISCLAIMER: {siteConfig.name} is an analytics tool. We are NOT a law firm,
              nor are we licensed immigration attorneys. The information and risk scores we provide
              do not constitute legal advice and cannot guarantee visa approval by any embassy or
              consulate.
            </p>
          </div>
        </section>

        {/* 2. User Responsibilities */}
        <section>
          <SectionHeading icon={UserIcon} title="2. User Responsibilities" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            You agree that all information and documents uploaded to our service are true, accurate,
            and belong to you or the applicant you represent. You must not upload fraudulent
            documents.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You agree not to reverse-engineer our service, spam our AI chatbot, or attempt to
            compromise our security.
          </p>
        </section>

        {/* 3. Payments and Refunds */}
        <section>
          <SectionHeading icon={CreditCardIcon} title="3. Payments and Refunds" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Our service is offered as a one-time payment per application. Payments are securely
            processed via Stripe.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Because our AI incurs compute costs immediately upon document upload and analysis, we
            generally do not offer refunds once you have used the system to review documents. A
            limited exception may apply if you followed the platform&apos;s guidance completely,
            received a visa rejection, and both the rejection and your compliance with that guidance
            can be verified.
          </p>
        </section>

        {/* 4. Intellectual Property */}
        <section>
          <SectionHeading icon={CopyrightIcon} title="4. Intellectual Property" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            The software, algorithms, codebases, branding, and workflows on {siteConfig.name} are
            the intellectual property of our company. You are granted a limited license strictly for
            personal or internal business use related to evaluating visa applications.
          </p>
        </section>

        {/* 5. AI-Generated Content Disclaimer — highlighted card */}
        <section className="rounded-2xl border bg-muted/30 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <SectionIcon icon={BrainCircuitIcon} />
            <h2 className="text-2xl font-semibold text-foreground">
              5. AI-Generated Content Disclaimer
            </h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Our platform uses artificial intelligence to generate document checklists, evaluate
            uploaded documents, assign risk scores, and provide chat-based guidance. You acknowledge
            and agree that:
          </p>
          <ul className="space-y-3">
            <ListItem>
              AI-generated checklists may not include every document required by a specific embassy
              or consulate. Requirements vary by location, visa category, and individual
              circumstances.
            </ListItem>
            <ListItem>
              Evaluation scores and risk assessments are algorithmic estimates, not guarantees of
              approval or rejection. Scores may fluctuate between evaluations due to model updates.
            </ListItem>
            <ListItem>
              Chat responses from our AI assistant (&quot;Atlas&quot;) are informational only and
              may contain inaccuracies. They do not constitute immigration advice.
            </ListItem>
            <ListItem>
              {siteConfig.name} shall not be liable for any losses, damages, or adverse outcomes
              arising from reliance on AI-generated checklists, scores, recommendations, or chat
              responses.
            </ListItem>
          </ul>
          <p className="text-sm text-foreground font-semibold mt-6">
            You are solely responsible for verifying all requirements with the relevant embassy or
            consulate and for the accuracy of your final visa application submission.
          </p>
        </section>

        {/* 6. Limitations of Liability */}
        <section>
          <SectionHeading icon={ShieldAlertIcon} title="6. Limitations of Liability" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Immigration decisions are entirely at the discretion of the respective embassy or
            consulate officers. Under no circumstances shall {siteConfig.name} or our suppliers be
            liable for any direct, indirect, incidental, or consequential damages (including, but
            not limited to, financial loss, travel delays, emotional distress, or loss of
            employment) resulting from an application rejection or the use/inability to use our
            service.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are exclusively responsible for the final submission of your visa application to the
            government portal. Our tool operates as a pre-submission review assistant only.
          </p>
        </section>

        {/* 7. Data Processing */}
        <section>
          <SectionHeading icon={DatabaseIcon} title="7. Data Processing" id="data-processing" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            By using our service, you acknowledge that your uploaded documents and personal data
            will be processed by third-party AI providers (including OpenAI and Perplexity AI) as
            described in our{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            . Document text content is sent to these providers solely for the purpose of delivering
            our evaluation and chat services. These providers operate under Data Processing
            Agreements and do not use your data to train their models.
          </p>
        </section>

        {/* 8. Modification of Terms */}
        <section>
          <SectionHeading icon={FileEditIcon} title="8. Modification of Terms" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            We reserve the right to modify these terms at any time. Your continued use of the
            platform after changes are posted constitutes acceptance of those changes.
          </p>
        </section>

      </PublicPageContent>
    </PublicPage>
  );
}
