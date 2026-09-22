import type { Metadata, Route } from "next"
import Link from "next/link"
import { CANONICAL_SITE_URL, PUBLIC_SIGN_UP_CTA_LABEL } from "@/constants"
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell"
import { buttonVariants } from "@/components/ui/button"
import { cn, constructMetadata } from "@/lib/utils"
import {
  LayoutListIcon,
  ScanTextIcon,
  ApertureIcon,
  UploadIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ArrowRightIcon,
} from "lucide-react"

export const metadata: Metadata = constructMetadata({
  title: "How visa document review works",
  description:
    "See how Vidicy reviews your application in three steps: a tailored checklist, AI evaluation with risk scoring, and Atlas chat guidance.",
  alternates: {
    canonical: "/how-it-works",
  },
})

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Review and Strengthen Your Visa Application with AI",
  description:
    "A 3-step process to review visa application documents, identify risks, and get AI-guided recommendations before submitting to an embassy or consulate.",
  url: `${CANONICAL_SITE_URL}/how-it-works`,
  totalTime: "PT15M",
  supply: [
    { "@type": "HowToSupply", name: "Passport scan (PDF)" },
    { "@type": "HowToSupply", name: "Bank statements (PDF)" },
    { "@type": "HowToSupply", name: "Supporting documents (PDFs)" },
  ],
  tool: [
    { "@type": "HowToTool", name: "Vidicy account (free)" },
  ],
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Create an application and generate your custom checklist",
      text: "Enter your visa type, destination country, applicant nationality, and embassy. The AI builds a checklist for your case instead of handing you a generic list.",
      url: `${CANONICAL_SITE_URL}/how-it-works#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Upload your documents for AI evaluation",
      text: "Upload your supporting documents as PDFs. The AI reads each one, pulls out the important details, compares the files against each other, and returns a risk score with specific flags.",
      url: `${CANONICAL_SITE_URL}/how-it-works#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Chat with Atlas and fix flagged issues",
      text: "Ask Atlas why something was flagged, what to fix, and how to strengthen parts of your application.",
      url: `${CANONICAL_SITE_URL}/how-it-works#step-3`,
    },
  ],
}

const STEP_1_CHECKLIST_EXAMPLES = [
  "Valid passport (min. 6 months validity)",
  "Schengen visa application form",
  "2 recent passport-sized photos",
  "Travel medical insurance (€30,000 min.)",
  "Bank statements — last 3 months",
  "Employment letter with leave approval",
  "Hotel and flight reservations",
  "Proof of ties to home country",
]

const STEP_2_FLAGS = [
  {
    icon: AlertTriangleIcon,
    label: "Consistency check",
    example: "Bank statement end date does not cover the travel window",
  },
  {
    icon: AlertTriangleIcon,
    label: "Completeness check",
    example: "Employment letter missing stated salary — flagged by consular officers",
  },
  {
    icon: AlertTriangleIcon,
    label: "Cross-document check",
    example: "Employer name in letter differs from employer name in bank statement header",
  },
  {
    icon: AlertTriangleIcon,
    label: "Format check",
    example: "Photo dimensions do not meet the 35×45mm Schengen requirement",
  },
]

const STEP_3_QUESTIONS = [
  "\"Why was my bank statement flagged?\"",
  "\"What should my employment letter say to avoid rejection?\"",
  "\"How do consular officers evaluate self-employment income?\"",
  "\"My stay is 21 days — how much should I show in savings?\"",
  "\"Is my travel insurance policy sufficient for this embassy?\"",
]

export default function HowItWorksPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <PublicPageHero
        eyebrow="How It Works"
        title="Review your visa documents in 3 steps"
        description="From a blank application to a submission-ready file, the workflow is guided by AI that understands your visa type, embassy, and documents."
        actions={
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "default", size: "lg" }))}
          >
            {PUBLIC_SIGN_UP_CTA_LABEL}
          </Link>
        }
      />

      <PublicPageContent className="space-y-20">

        {/* Step 1 */}
        <section id="step-1" className="scroll-mt-20">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
              1
            </div>
            <div className="flex items-center gap-3">
              <LayoutListIcon className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">
                Generate your embassy-specific checklist
              </h2>
            </div>
          </div>

          <div className="pl-16 space-y-6">
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4">
              <p>
                Create a new application and enter the basics: your visa type, destination
                country, specific embassy, and the applicant&apos;s nationality.
              </p>
              <p>
                With that context, the AI generates a personalised document checklist. It is not
                a generic government list. It accounts for the requirements of your embassy,
                common edge cases for your nationality, and the documents officers usually expect
                even when they are technically optional.
              </p>
              <p>
                Each checklist item is marked as required or recommended, and you can add custom
                items for anything specific to your situation.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-3">
                Example checklist — Schengen tourist visa (France embassy):
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STEP_1_CHECKLIST_EXAMPLES.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Adding collaborators:</span>{" "}
                If you&apos;re applying as a family or working with an immigration consultant,
                invite them with role-based access so everyone works from the same checklist and
                document set.
              </p>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t" />

        {/* Step 2 */}
        <section id="step-2" className="scroll-mt-20">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
              2
            </div>
            <div className="flex items-center gap-3">
              <ScanTextIcon className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">
                Upload documents for AI evaluation
              </h2>
            </div>
          </div>

          <div className="pl-16 space-y-6">
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4">
              <p>
                Upload your supporting documents as PDFs, one per checklist item. Each file is
                stored securely and processed right away.
              </p>
              <p>
                The AI reads every document, pulls out the key details, and checks the files
                against one another.
              </p>
              <p>
                The result is a structured evaluation: an overall risk score, plus a detailed list
                of specific flags. Each flag shows the document, the issue, the severity, and why
                it matters.
              </p>
              <p>
                When you fix something and re-upload a revised document, the evaluation updates
                automatically. You can keep going until the file feels ready.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-3">
                Types of issues the AI detects:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STEP_2_FLAGS.map(({ icon: Icon, label, example }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">{example}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4">
              <UploadIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Document security:</span>{" "}
                Files are encrypted in transit and at rest. They live in Cloudflare R2 and are
                never shared with third parties or used to train models.
              </p>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t" />

        {/* Step 3 */}
        <section id="step-3" className="scroll-mt-20">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
              3
            </div>
            <div className="flex items-center gap-3">
              <ApertureIcon className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground">
                Chat with Atlas to fix and strengthen your application
              </h2>
            </div>
          </div>

          <div className="pl-16 space-y-6">
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4">
              <p>
                Atlas is the AI assistant built into Vidicy. It has read your full
                document package, so when you ask a question it answers from your files instead of
                the internet.
              </p>
              <p>
                Atlas can explain why a flag was raised, tell you what a stronger version of a
                document should include, and give you embassy-specific guidance on common
                rejection patterns for your visa type.
              </p>
              <p>
                You can also use Atlas for broader questions about your application: which
                financial documents help, how officers look at self-employment, or what a credible
                travel itinerary looks like for your destination.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-3">
                Questions applicants ask Atlas:
              </p>
              <ul className="space-y-2">
                {STEP_3_QUESTIONS.map((q) => (
                  <li key={q} className="flex items-start gap-2.5">
                    <MessageSquareIcon className="h-4 w-4 text-primary shrink-0 mt-1" />
                    <span className="text-sm text-muted-foreground">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t" />

        {/* The loop */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <RefreshCwIcon className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">
              The iterative improvement loop
            </h2>
          </div>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4 mb-6">
            <p>
              Preparing a visa application usually takes more than one pass. You review, revise,
              and re-submit until the file is strong enough to move forward.
            </p>
            <p>
              Each time you re-upload a document, the AI re-evaluates the full package and updates
              your risk score. You can see which flags are gone and which still need work. Most
              applicants go through two or three rounds of revisions before they are happy with
              the result.
            </p>
            <p>
              There is no limit to the number of revisions. Upload until you feel confident, then
              submit knowing you have handled the issues the AI found.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {["Generate checklist", "Upload documents", "Fix flagged issues", "Re-evaluate"].map(
              (step, i) => (
                <div key={step} className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {i + 1}
                  </div>
                  <span className="text-xs text-muted-foreground leading-snug">{step}</span>
                </div>
              )
            )}
          </div>
        </section>

        {/* Visa type links */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Supported visa types
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Each visa type has its own document requirements and small embassy-level differences.
            Browse the checklist for your destination.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { href: "/visas/us", label: "US Visas", description: "B1/B2, F-1, H-1B, O-1" },
              { href: "/visas/schengen", label: "Schengen Visas", description: "All 29 member states" },
              { href: "/visas/uk", label: "UK Visas", description: "Visitor, Skilled Worker, Student" },
              { href: "/visas/canada", label: "Canada Visas", description: "Visitor, Study, Work Permit" },
              { href: "/visas/australia", label: "Australia Visas", description: "Visitor, Student, Skilled" },
            ].map((visa) => (
              <Link
                key={visa.href}
                href={visa.href as Route}
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 hover:bg-muted/60 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{visa.label}</p>
                  <p className="text-xs text-muted-foreground">{visa.description}</p>
                </div>
                <ArrowRightIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>

      </PublicPageContent>
    </PublicPage>
  )
}
