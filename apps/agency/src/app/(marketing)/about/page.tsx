import Link from "next/link"
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell"
import { CANONICAL_SITE_URL } from "@/constants"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { constructMetadata } from "@/lib/utils"
import {
  ShieldCheckIcon,
  ZapIcon,
  BrainCircuitIcon,
  FileTextIcon,
  UsersIcon,
  LockIcon,
  ApertureIcon,
} from "lucide-react"

export const metadata = constructMetadata({
  title: "About Vidicy: AI Visa Document Review",
  description:
    "AI platform that helps you catch visa document issues early, build embassy-specific checklists, and submit a stronger application.",
  alternates: {
    canonical: "/about",
  },
})

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Vidicy",
  url: CANONICAL_SITE_URL,
  description:
    "Vidicy is an AI-powered visa preparation platform that reviews application documents, generates embassy-specific document checklists, scores applications for risk, and provides an AI assistant (Atlas) to help applicants address flagged issues before submitting to a consulate or embassy.",
  email: "support@vidicy.com",
  knowsAbout: [
    "Visa application document requirements",
    "Schengen visa applications",
    "US visa applications",
    "UK visa applications",
    "Canada visa applications",
    "Australia visa applications",
    "Embassy document checklists",
    "Visa rejection prevention",
    "AI document review",
    "Consular officer document evaluation",
  ],
}

const CAPABILITIES = [
  {
    icon: FileTextIcon,
    title: "Embassy-specific document checklists",
    description:
      "Our AI generates a tailored list of required documents based on the exact visa type, nationality, and destination embassy — not a generic template.",
  },
  {
    icon: ZapIcon,
    title: "Full-package AI evaluation",
    description:
      "Every uploaded document is parsed, cross-referenced against the checklist, and evaluated for consistency, completeness, and common rejection patterns.",
  },
  {
    icon: BrainCircuitIcon,
    title: "Atlas — your application-aware AI assistant",
    description:
      "Atlas is an AI chat assistant that has read your entire document package. Ask it why something was flagged, what to fix, or how embassy officers typically view a specific document type.",
  },
  {
    icon: UsersIcon,
    title: "Collaboration for families and consultants",
    description:
      "Invite co-applicants or your immigration consultant to your application with role-based access. All parties work from the same document set and evaluation.",
  },
  {
    icon: ZapIcon,
    title: "Iterative improvement loop",
    description:
      "Re-upload revised documents at any time. Each upload triggers a fresh AI evaluation with updated risk scoring, so you can keep improving until your application is ready.",
  },
  {
    icon: ApertureIcon,
    title: "Risk scoring and progress tracking",
    description:
      "Every evaluation produces a risk score with specific flags. Track how your score improves across document revisions and know precisely what remains unresolved.",
  },
]

const TRUST_POINTS = [
  "Documents are encrypted in transit and at rest using enterprise-grade encryption",
  "Files are stored in Cloudflare R2 object storage — never shared with third parties",
  "Each application is access-controlled: only you and explicitly invited collaborators can view it",
  "Documents are used solely to evaluate your visa application — never for advertising or model training",
  "Sessions are secured with cryptographic tokens and expire automatically",
]

export default function AboutPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />

      <PublicPageHero
        eyebrow="About"
        title="Visa preparation without the guesswork."
        description="Vidicy reviews your documents, builds embassy-specific checklists, scores your application for risk, and gives you an AI assistant that knows the file you uploaded."
      />

      <PublicPageContent className="space-y-16">

        {/* The problem */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            The problem we solve
          </h2>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4">
            <p>
              Most visa rejections come down to avoidable document mistakes. A bank statement
              that misses the required date range. An employment letter that leaves out salary.
              A date mismatch between two files that makes the rest of the application look shaky.
            </p>
            <p>
              Those mistakes are hard to spot on your own. There is no universal checklist that
              covers every visa type, nationality, and embassy. There is also no simple way to
              read the whole file and see what a consular officer is likely to question before
              you get to the interview.
            </p>
            <p>
              That is the gap Vidicy fills.
            </p>
          </div>
        </section>

        {/* How it works — brief */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            How the platform works
          </h2>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4 mb-8">
            <p>
              When you create an application, you enter your visa type, destination country, and
              applicant details. From there, the AI builds a checklist for your embassy instead of
              handing you a generic list.
            </p>
            <p>
              You upload your supporting documents as PDFs. The system pulls out the text,
              compares it against the visa requirements, and checks the files against each other
              for inconsistencies.
            </p>
            <p>
              The result is a clear evaluation: a risk score, specific flags with explanations,
              and guidance on what to fix. You can revise and re-upload whenever you want, and
              each upload gives you a fresh read on the file.
            </p>
            <p>
              Atlas, our AI assistant, stays with you through the process. It has read your full
              document package, so you can ask why something was flagged, what officers usually
              look for, or how to tighten up a cover letter for your case.
            </p>
          </div>
          <Link
            href="/how-it-works"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            See detailed walkthrough →
          </Link>
        </section>

        {/* Capabilities */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-8">
            Platform capabilities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {CAPABILITIES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Technology */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            The technology
          </h2>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground space-y-4">
            <p>
              Vidicy runs on an AI stack built for speed and accuracy. Uploaded
              files go through PDF parsing, which pulls structured text out of the document and
              checks it against visa-specific requirements.
            </p>
            <p>
              For semantic search and context-aware chat, the documents are split into overlapping
              chunks, embedded with OpenAI models, and stored in Cloudflare Vectorize so Atlas
              can find the right sections when you ask a question.
            </p>
            <p>
              Atlas, the chat assistant, is powered by Perplexity AI and works with your document
              package directly. It is not a generic chatbot. It answers from your files and can
              point to details from bank statements, employment letters, or your passport.
            </p>
            <p>
              The platform runs on Cloudflare Workers, so responses stay fast no matter where
              you&apos;re applying from.
            </p>
          </div>
        </section>

        {/* Security */}
        <section className="rounded-2xl border bg-muted/30 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <LockIcon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">
              Security and privacy
            </h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Visa applications include highly sensitive personal and financial information, so we
            treat that part of the job carefully.
          </p>
          <ul className="space-y-3">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <ShieldCheckIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{point}</span>
              </li>
            ))}
          </ul>
        </section>

      </PublicPageContent>
    </PublicPage>
  )
}
