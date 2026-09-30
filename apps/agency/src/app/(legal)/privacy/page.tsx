import { Metadata } from "next";
import Link from "next/link";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { CANONICAL_SITE_URL } from "@/constants";
import { cn, constructMetadata } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import {
  ShieldCheckIcon,
  DatabaseIcon,
  GlobeIcon,
  ClockIcon,
  LockIcon,
  CookieIcon,
  ScaleIcon,
  MailIcon,
  UserIcon,
  BabyIcon,
  FileEditIcon,
  CheckCircle2Icon,
} from "lucide-react";

const privacyDescription =
  "Learn how Vidicy collects, uses, and protects agency account data and client visa documents processed through the review workflow.";

export const metadata: Metadata = constructMetadata({
  title: "Privacy Policy for Agency Visa Data",
  description: privacyDescription,
  alternates: {
    canonical: "/privacy",
  },
});

const privacyPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Privacy Policy",
  description: privacyDescription,
  url: `${CANONICAL_SITE_URL}/privacy`,
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

function SectionIcon({ icon: Icon }: { icon: typeof ShieldCheckIcon }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-5 w-5 text-primary" />
    </div>
  );
}

function SectionHeading({ icon, title, id }: { icon: typeof ShieldCheckIcon; title: string; id?: string }) {
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

export default function PrivacyPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(privacyPageSchema) }}
      />

      <PublicPageHero
        eyebrow="Legal"
        title="Privacy Policy"
        meta="Last updated: October 2, 2026"
        description="How Vidicy handles agency accounts, client visa documents, uploaded files, subprocessors, cookies, and data rights."
      />

      <PublicPageContent className="space-y-16">

        {/* 1. Information We Collect */}
        <section>
          <SectionHeading icon={DatabaseIcon} title="1. Information We Collect" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            At {siteConfig.name}, we collect information needed to operate agency visa review workflows. This includes:
          </p>
          <ul className="space-y-3">
            <ListItem><strong className="text-foreground">Agency account information:</strong> Names, email addresses, authentication data, organization details, and role information for agency users.</ListItem>
            <ListItem><strong className="text-foreground">Client and applicant details:</strong> Passport number, date of birth, nationality, visa history, travel dates, and related information entered or uploaded by an agency user.</ListItem>
            <ListItem><strong className="text-foreground">Visa documents:</strong> Documents, images, and forms uploaded for review, which may include passports, bank statements, invitation letters, employment records, bookings, and other supporting materials.</ListItem>
            <ListItem><strong className="text-foreground">Usage data:</strong> Information about how agency users interact with queues, reviews, reports, document checks, and support workflows.</ListItem>
            <ListItem><strong className="text-foreground">Technical Data:</strong> IP address (stored with your session for security purposes), browser type, and device information collected automatically.</ListItem>
          </ul>
        </section>

        {/* 2. Legal Basis */}
        <section>
          <SectionHeading icon={ScaleIcon} title="2. Legal Basis for Processing (GDPR Article 6)" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">We process your personal data based on the following lawful grounds:</p>
          <ul className="space-y-3">
            <ListItem><strong className="text-foreground">Contract Performance:</strong> Processing data is necessary to provide agency review workflows, document evaluation, issue tracking, and client-ready reporting.</ListItem>
            <ListItem><strong className="text-foreground">Consent:</strong> Agency users provide consent when creating an account and agreeing to our Terms of Service and this Privacy Policy. Consent may be withdrawn where applicable.</ListItem>
            <ListItem><strong className="text-foreground">Legitimate Interest:</strong> We process certain data to improve our services, ensure platform security, and prevent fraud, where such interests are not overridden by your rights.</ListItem>
          </ul>
        </section>

        {/* 3. How We Use Your Information */}
        <section>
          <SectionHeading icon={UserIcon} title="3. How We Use Your Information" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">We use the information we collect primarily to deliver our core services:</p>
          <ul className="space-y-3">
            <ListItem>To analyze uploaded client documents and detect missing items, weak evidence, and inconsistencies.</ListItem>
            <ListItem>To provide route-specific checklists, reviewer flags, and feedback for agency workflows.</ListItem>
            <ListItem>To support document review and question-answering using context from the relevant case files.</ListItem>
            <ListItem>To process transactions and send you related information, including confirmations and receipts.</ListItem>
            <ListItem>To send technical notices, updates, security alerts, and support messages.</ListItem>
          </ul>
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm text-foreground">
              <strong>Important:</strong> We do <strong>not</strong> use agency client documents or data to train public models. Documents are processed solely to provide the review workflow.
            </p>
          </div>
        </section>

        {/* 4. Third-Party Data Processors */}
        <section>
          <SectionHeading icon={GlobeIcon} title="4. Third-Party Data Processors" id="data-processors" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            We rely on a small set of trusted third-party subprocessors to operate the product, including providers for automated document processing, hosting, payments, email delivery, authentication, monitoring, and account-security checks.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For the current public registry of subprocessors, their role in the service, and their website, see our{" "}
            <Link href="/subprocessors" className="font-medium text-primary hover:underline">
              Subprocessors page
            </Link>
            . Each provider operates under a Data Processing Agreement (DPA) or comparable contractual safeguards where applicable.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
            We do not sell, trade, or rent your personal information to any third party. Data is shared with processors solely for the purpose of operating our service.
          </p>
        </section>

        {/* 5. International Data Transfers */}
        <section>
          <SectionHeading icon={GlobeIcon} title="5. International Data Transfers" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Your data may be processed outside your country of residence. Specifically:
          </p>
          <ul className="space-y-3">
            <ListItem>Personal data may be processed by automated document-processing providers in the United States.</ListItem>
            <ListItem>Personal data may be processed by requirement lookup providers in the United States.</ListItem>
            <ListItem>Data may be stored and served through Cloudflare&apos;s globally distributed infrastructure.</ListItem>
            <ListItem>Email notifications may be processed by Resend in the United States.</ListItem>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
            These transfers are protected by Data Processing Agreements with each provider, which include Standard Contractual Clauses (SCCs) as approved by the European Commission where applicable.
          </p>
        </section>

        {/* 6. Data Retention */}
        <section>
          <SectionHeading icon={ClockIcon} title="6. Data Retention" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">We retain agency and client data for the following periods:</p>
          <ul className="space-y-3">
            <ListItem><strong className="text-foreground">Account data:</strong> Retained until the account is deleted.</ListItem>
            <ListItem><strong className="text-foreground">Client applications and uploaded documents:</strong> Retained until the relevant case, workspace, or account is deleted, unless a legal or operational retention obligation applies.</ListItem>
            <ListItem><strong className="text-foreground">Review history:</strong> Retained as part of the relevant client case and deleted when the case is deleted.</ListItem>
            <ListItem><strong className="text-foreground">Document embeddings (Vectorize):</strong> Deleted when the associated document or application is deleted.</ListItem>
            <ListItem><strong className="text-foreground">Session data:</strong> Automatically expires after 30 days of inactivity.</ListItem>
            <ListItem><strong className="text-foreground">Payment records:</strong> Retained as required by applicable tax and accounting laws.</ListItem>
          </ul>
        </section>

        {/* 7. Data Security — highlighted card */}
        <section className="rounded-2xl border bg-muted/30 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <SectionIcon icon={LockIcon} />
            <h2 className="text-2xl font-semibold text-foreground">7. Data Security</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Security is critical when handling sensitive agency and client visa application materials. We implement multiple layers of protection:
          </p>
          <ul className="space-y-3">
            {[
              ["Encryption in transit:", "All data is transmitted over TLS (HTTPS)."],
              ["Encryption at rest:", "Uploaded documents are stored in Cloudflare R2 with AES-256 server-side encryption. Database records in Cloudflare D1 are encrypted at the storage layer."],
              ["Password security:", "Passwords are hashed using PBKDF2-SHA256 with 100,000 iterations and a 128-bit random salt. We use constant-time comparison to prevent timing attacks."],
              ["Session security:", "Session tokens use 256 bits of cryptographic entropy, are stored in httpOnly secure cookies, and automatically expire after 30 days. A maximum of 5 concurrent sessions per user is enforced."],
              ["Rate limiting:", "Authentication endpoints and API routes are protected by rate limiting to prevent brute-force attacks."],
              ["CSRF protection:", "All mutation requests are validated against a per-session CSRF token."],
            ].map(([label, text]) => (
              <li key={label} className="flex items-start gap-2.5">
                <ShieldCheckIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-foreground"><strong>{label}</strong> {text}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-6">
            Document embeddings stored in Cloudflare Vectorize are numerical vector representations that cannot be reverse-engineered to recover the original document text.
          </p>
        </section>

        {/* 8. Cookies and Tracking */}
        <section>
          <SectionHeading icon={CookieIcon} title="8. Cookies and Tracking" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">We use the following cookies, all of which are necessary for the operation of our service:</p>
          <ul className="space-y-3">
            <ListItem><strong className="text-foreground">session</strong> — Authentication session cookie (httpOnly, secure, 30-day expiry).</ListItem>
            <ListItem><strong className="text-foreground">csrf-token</strong> — Cross-site request forgery protection (httpOnly, secure, 24-hour expiry).</ListItem>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
            We use Cloudflare Web Analytics for anonymous, aggregated performance metrics. This does not use cookies and does not track individual users.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
            We do not use any advertising trackers, retargeting pixels, or third-party analytics that track individual users.
          </p>
        </section>

        {/* 9. Your Rights */}
        <section>
          <SectionHeading icon={ScaleIcon} title="9. Your Rights" />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Depending on your location, you may have the following rights under GDPR, UK GDPR, CCPA, or other applicable data protection laws:
          </p>
          <ul className="space-y-3">
            <ListItem><strong className="text-foreground">Right to Access:</strong> Request a copy of the personal data we hold about you.</ListItem>
            <ListItem><strong className="text-foreground">Right to Rectification:</strong> Request correction of inaccurate personal data.</ListItem>
            <ListItem><strong className="text-foreground">Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> Request deletion of your account and all associated data, including uploaded documents, evaluations, chat history, and document embeddings.</ListItem>
            <ListItem><strong className="text-foreground">Right to Data Portability:</strong> Request your data in a structured, machine-readable format.</ListItem>
            <ListItem><strong className="text-foreground">Right to Object:</strong> Object to certain types of data processing.</ListItem>
            <ListItem><strong className="text-foreground">Right to Withdraw Consent:</strong> Withdraw your consent at any time by deleting your account.</ListItem>
            <ListItem><strong className="text-foreground">Right to Lodge a Complaint:</strong> File a complaint with your local data protection authority.</ListItem>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mt-4">
            <strong className="text-foreground">How to exercise your rights:</strong> Agency users can delete review cases and their documents directly from the dashboard where available. To delete an entire account or exercise any other right listed above, please contact us at{" "}
            <a href={`mailto:${siteConfig.links.email}`} className="text-primary hover:underline">{siteConfig.links.email}</a>.
            We will respond to your request within 30 days.
          </p>
        </section>

        {/* 10. Google API */}
        <section>
          <SectionHeading icon={GlobeIcon} title="10. Google API Services Usage Disclosure" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {siteConfig.name}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements. We only request the minimum required scopes necessary for authentication (such as email and basic profile information) unless explicit consent is provided for additional integrations.
          </p>
        </section>

        {/* 11. Children's Privacy */}
        <section>
          <SectionHeading icon={BabyIcon} title="11. Children's Privacy" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our service is not directed at children under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will promptly delete it.
          </p>
        </section>

        {/* 12. Changes to This Policy */}
        <section>
          <SectionHeading icon={FileEditIcon} title="12. Changes to This Policy" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. If we make material changes, we will notify you by posting the updated policy on this page with a new &quot;Last updated&quot; date. We encourage you to review this policy periodically.
          </p>
        </section>

        {/* 13. Contact Us */}
        <section className="pb-4">
          <div className="flex items-center gap-3 mb-4">
            <SectionIcon icon={MailIcon} />
            <h2 className="text-2xl font-semibold text-foreground">13. Contact Us</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-3xl">
            If you have any questions about this Privacy Policy, wish to exercise your data protection rights, or want to request the deletion of your data, please contact us at{" "}
            <a href={`mailto:${siteConfig.links.email}`} className="text-primary hover:underline">{siteConfig.links.email}</a>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "default", size: "lg" }))}
            >
              Return to Home
            </Link>
            <Link
              href="/terms"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Terms of Service
            </Link>
          </div>
        </section>

      </PublicPageContent>
    </PublicPage>
  );
}
