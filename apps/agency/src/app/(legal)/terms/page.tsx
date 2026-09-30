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
  "Read the terms of service for Vidicy agency review workflows, including acceptable use, AI limits, data processing, and service boundaries.";

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
        description="The terms that govern Vidicy for agency review workflows, including acceptable use, AI limitations, data processing, and liability boundaries."
      />

      <PublicPageContent className="space-y-16">
        {/* 1. Acceptance of Terms */}
        <section>
          <SectionHeading icon={FileTextIcon} title="1. Acceptance of Terms" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            By accessing {siteConfig.name}, creating an account, joining a pilot, or purchasing a subscription, you
            accept and agree to be bound by the terms and provisions of this agreement. Our platform
            uses artificial intelligence to help agencies review visa application files for missing
            documents, weak evidence, and cross-file inconsistencies.
          </p>
          <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 flex items-start gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
            <p className="text-sm text-foreground font-medium">
              IMPORTANT DISCLAIMER: {siteConfig.name} is review workflow software. We are not a law
              firm or licensed immigration advisor. Output from the product does not constitute
              legal advice and cannot guarantee visa approval by any government authority.
            </p>
          </div>
        </section>

        {/* 2. User Responsibilities */}
        <section>
          <SectionHeading icon={UserIcon} title="2. User Responsibilities" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            You agree that all information and documents uploaded to our service are true, accurate,
            and uploaded with appropriate authority from your agency, client, applicant, or other
            authorized party. You must not upload fraudulent documents.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You agree not to reverse-engineer our service, spam our AI chatbot, or attempt to
            compromise our security.
          </p>
        </section>

        {/* 3. Commercial Terms */}
        <section>
          <SectionHeading icon={CreditCardIcon} title="3. Commercial Terms" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Our agency product is offered through pilot, subscription, usage-based, or enterprise
            commercial terms depending on the scope of the workflow.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Because document review can incur compute, storage, and support costs immediately,
            credits, cancellations, and pilot terms are handled according to the applicable
            written agreement or order form.
          </p>
        </section>

        {/* 4. Intellectual Property */}
        <section>
          <SectionHeading icon={CopyrightIcon} title="4. Intellectual Property" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            The software, algorithms, codebases, branding, and workflows on {siteConfig.name} are
            the intellectual property of our company. You are granted a limited license strictly for
            internal business use related to reviewing visa application files.
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
            Our platform uses artificial intelligence to generate document checks, evaluate uploaded
            documents, flag review issues, and support reviewer workflows. You acknowledge and agree
            that:
          </p>
          <ul className="space-y-3">
            <ListItem>
              AI-generated checks may not include every document required by a specific government,
              embassy, consulate, or visa application center. Requirements vary by route and
              applicant circumstances.
            </ListItem>
            <ListItem>
              Review flags and risk signals are algorithmic estimates, not guarantees of approval,
              rejection, or agency quality control completion.
            </ListItem>
            <ListItem>
              AI responses are informational workflow support and may contain inaccuracies. They do
              not constitute immigration advice.
            </ListItem>
            <ListItem>
              {siteConfig.name} shall not be liable for adverse outcomes arising from reliance on
              AI-generated checks, flags, recommendations, or responses.
            </ListItem>
          </ul>
          <p className="text-sm text-foreground font-semibold mt-6">
            Agencies remain responsible for verifying official requirements, reviewing the final
            file, and deciding what is submitted to the relevant authority.
          </p>
        </section>

        {/* 6. Limitations of Liability */}
        <section>
          <SectionHeading icon={ShieldAlertIcon} title="6. Limitations of Liability" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Immigration decisions are entirely at the discretion of the relevant government
            authority. Under no circumstances shall {siteConfig.name} or our suppliers be
            liable for any direct, indirect, incidental, or consequential damages (including, but
            not limited to, financial loss, travel delays, emotional distress, or loss of
            employment) resulting from an application rejection or the use/inability to use our
            service.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The agency, client, or authorized representative is responsible for final submission.
            Our product operates as a pre-submission review workflow only.
          </p>
        </section>

        {/* 7. Data Processing */}
        <section>
          <SectionHeading icon={DatabaseIcon} title="7. Data Processing" id="data-processing" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            By using our service, you acknowledge that uploaded documents and personal data may be
            processed by third-party AI providers (including OpenAI and Perplexity AI) as
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
