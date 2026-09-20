import {
  Check,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { FaApplePay, FaCcAmex, FaCcVisa, FaPaypal, FaStripe } from "react-icons/fa";

import type { HomepageConfig } from "@/components/homepage/config";
import { FadeUp } from "@/components/homepage/hero-client";
import { homepageFaqItems } from "@/components/homepage/faq";
import {
  SectionIntro,
  SectionShell,
  SectionSurface,
} from "@/components/homepage/section-primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { pricingPlans } from "@/config/pricing";
import { cn } from "@/lib/utils";

const problemCards = [
  {
    title: "Small Mistakes, Big Costs",
    body: "A typo, missing page, outdated form, or weak supporting document can cost you weeks of delay and another filing fee. A lot of refusals come down to paperwork quality, not qualifications alone.",
    imageSrc: "/homepage/problem-document-hygiene.webp",
    imageAlt: "Visa paperwork being checked for missing pages, form errors, and small corrections",
  },
  {
    title: "Generic Checklists Fail",
    body: "Embassy and consulate requirements change more often than people expect. A generic checklist rarely tells you what your exact route and filing location will actually ask to see.",
    imageSrc: "/homepage/problem-route-specificity.webp",
    imageAlt: "Passport, route map, and separate embassy document stacks for different filing routes",
  },
  {
    title: "Invisible Red Flags",
    body: "A mismatch between your statements, employment letter, travel dates, or sponsor documents can be enough to weaken the file before anyone asks you a question.",
    imageSrc: "/homepage/problem-consistency-check.webp",
    imageAlt: "Visa documents connected by verification lines with one inconsistency highlighted",
  },
  {
    title: "Conflicting Advice",
    body: "Forums, group chats, and social posts can be helpful, but they also repeat stale advice. Without a route-specific reference point, you are still guessing.",
    imageSrc: "/homepage/problem-signal-over-noise.webp",
    imageAlt: "Official visa checklist filtered apart from blurred online advice and chat messages",
  },
] as const;

const howItWorksSteps = [
  {
    title: "Build Your Custom List",
    body: "Start free, answer a few questions, and get a checklist tied to your visa type, passport, current country, and embassy or consulate.",
    imageSrc: "/homepage/how-custom-list.webp",
    imageAlt: "Questionnaire card leading to a tailored visa checklist",
  },
  {
    title: "Catch Every Hidden Risk",
    body: "Upload your documents and let Vidicy check for missing pages, weak evidence, and cross-document inconsistencies before you submit.",
    imageSrc: "/homepage/how-hidden-risk.webp",
    imageAlt: "Uploaded visa documents being scanned for a hidden warning",
  },
  {
    title: "Submit with Certainty",
    body: "Follow the guidance, re-upload improved files, and keep tightening the application until the remaining risks are clear and manageable.",
    imageSrc: "/homepage/how-submit-certainty.webp",
    imageAlt: "Clean visa document stack with a check mark ready for submission",
  },
] as const;

export function HeroSection({
  config,
  sectionId,
}: {
  config: HomepageConfig;
  sectionId?: string;
}) {
  return (
    <section
      id={sectionId}
      aria-label={config.title}
      className="relative isolate min-h-[100svh] overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[-8rem] z-0 mx-auto h-[24rem] w-full max-w-6xl rounded-[3rem] bg-gradient-to-b from-background via-background/92 to-background/0 blur-3xl sm:top-[-7rem] sm:h-[30rem] sm:rounded-[4rem] md:h-[36rem]"
      />
      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="flex w-full flex-col items-center px-4 pb-10 sm:px-6 sm:pb-14 md:px-10 md:pb-16 lg:px-16 xl:px-20">
          <div className="relative z-10 flex w-full max-w-5xl flex-col items-center pt-24 sm:pt-28 md:pt-32">
            <FadeUp delay={0} duration={0.5} y={10} className="mb-5 sm:mb-6">
              <Link
                href="/#pricing"
                className="group flex w-auto items-center space-x-2 rounded-full border border-primary/20 bg-background/50 px-3 py-1.5 backdrop-blur-md transition-all hover:bg-background/80 hover:ring-1 hover:ring-primary/50"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="inline-flex h-5 items-center justify-center rounded-full border border-black/80 border-b-black/95 border-t-white/25 bg-[linear-gradient(180deg,#1a1a1a_0%,#070707_52%,#000000_100%)] px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] transition-[transform,background-image,border-color] duration-200 group-hover:bg-[linear-gradient(180deg,#202020_0%,#0d0d0d_52%,#040404_100%)] group-hover:border-t-white/35 sm:text-[10px]">
                    NEW
                  </span>
                  <span className="text-[11px] font-medium text-foreground sm:text-xs">
                    Get approved or get your money back!
                  </span>
                  <svg
                    className="h-3.5 w-3.5 text-foreground transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </FadeUp>

            <FadeUp delay={0.1} duration={0.6} y={16}>
              <h1 className="max-w-4xl text-center font-display text-[3.1rem] leading-[0.98] tracking-tight text-foreground [font-family:var(--font-display)] sm:text-[3.8rem] sm:leading-[0.95] md:text-6xl md:leading-[0.92] lg:text-[5rem]">
                Don&apos;t Let a{" "}
                <span className="italic text-primary">Small Mistake</span> Get Your{" "}
                <span className="relative top-[0.04em] inline-block italic text-[#7A0A12]">
                  Visa Rejected
                </span>
              </h1>
            </FadeUp>

            <FadeUp delay={0.2} duration={0.6} y={16}>
              <p className="mt-4 max-w-2xl text-center text-[0.875rem] leading-6 text-foreground/72 sm:text-[1rem] sm:leading-7 md:max-w-[720px] md:text-[1.125rem]">
                Instead of generic advice, get a checklist built for your case and unlimited document
                reviews that show exactly what to fix each time until your files are ready to submit.
              </p>
            </FadeUp>

            <div className="mt-12 flex w-full flex-nowrap items-center justify-center gap-3">
              <FadeUp
                delay={0.32}
                duration={0.52}
                y={14}
                className="w-auto"
              >
                <Button
                  asChild
                  className="hero-cta-metal-shine relative isolate w-auto !h-11 overflow-hidden rounded-full border border-black/86 border-b-black/95 border-t-white/34 !bg-[linear-gradient(180deg,#3b3b3b_0%,#252525_22%,#131313_58%,#050505_100%)] px-5 text-sm font-semibold !text-[#FFFFFF] shadow-[0_0_0_1px_rgba(255,255,255,0.07)_inset,0_-10px_16px_rgba(0,0,0,0.58)_inset,0_12px_24px_rgba(0,0,0,0.42)] transition-[transform,box-shadow,background-image,border-color] duration-200 hover:-translate-y-[1px] hover:!bg-[linear-gradient(180deg,#454545_0%,#2b2b2b_22%,#171717_58%,#080808_100%)] hover:border-t-white/42 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_-10px_16px_rgba(0,0,0,0.62)_inset,0_16px_28px_rgba(0,0,0,0.48)] active:translate-y-[2px] active:shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_-7px_12px_rgba(0,0,0,0.54)_inset,0_7px_15px_rgba(0,0,0,0.3)] sm:!h-12 sm:px-8"
                >
                  <Link href={"/sign-up" as Route} className="relative z-[1]">
                    Get My Free Review
                  </Link>
                </Button>
              </FadeUp>
            </div>

            <FadeUp delay={0.48} duration={0.55} y={12}>
              <p className="mt-4 max-w-2xl text-center text-sm font-medium text-foreground/66">
                Your first evaluation is free. No card needed.
              </p>
            </FadeUp>

            <FadeUp delay={0.5} duration={0.8} y={30} className="mt-8 w-full max-w-5xl sm:mt-10 md:mt-12">
              <div className="overflow-hidden rounded-[1.9rem] border border-[#6F8293]/55 bg-[#E7EDF5]/90 p-2 shadow-[var(--shadow-dashboard)] sm:rounded-[2.15rem] sm:p-2.5 md:rounded-[2.35rem]">
                <div className="overflow-hidden rounded-[1.55rem] border border-[#6F8293]/75 bg-background sm:rounded-[1.75rem] md:rounded-[1.95rem]">
                  <Image
                    src="/vidicy-hero-dashboard.png"
                    alt="Vidicy dashboard showing readiness score, embassy checklist, and flagged document issues"
                    width={1600}
                    height={983}
                    priority
                    sizes="(min-width: 1024px) 1024px, calc(100vw - 2rem)"
                    className="block h-auto w-full"
                  />
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProblemSection() {
  return (
    <SectionShell>
      <SectionSurface>
        <SectionIntro
          title="The Hidden Risks"
          subtitle="Even strong applicants get tripped up by avoidable document issues that only show up once the full file is read together."
        />

        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 xl:grid-cols-4">
          {problemCards.map(({ title, body, imageSrc, imageAlt }) => (
            <div
              key={title}
              className="overflow-hidden rounded-[1.55rem] border border-border/80 bg-background shadow-sm sm:rounded-[1.75rem]"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border/70 bg-muted">
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  width={960}
                  height={600}
                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-foreground/78">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionSurface>
    </SectionShell>
  );
}

export function HowItWorksSection() {
  return (
    <SectionShell id="how-it-works">
      <SectionSurface>
        <SectionIntro
          title="How It Works"
          subtitle="Start free, upload your documents, and tighten the application before you decide whether to unlock deeper review support."
        />

        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
          {howItWorksSteps.map(({ title, body, imageSrc, imageAlt }) => (
            <div
              key={title}
              className="overflow-hidden rounded-[1.55rem] border border-border/80 bg-background shadow-sm sm:rounded-[1.75rem]"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border/70 bg-muted">
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  width={960}
                  height={600}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-foreground/78">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionSurface>
    </SectionShell>
  );
}

export function PricingSection() {
  return (
    <SectionShell id="pricing">
      <SectionSurface>
        <SectionIntro
          title="Pricing"
          subtitle="Start free, then pay once per application if you want unlimited evaluations, Atlas guidance, and deeper review support."
        />

        <div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-2 xl:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-[1.6rem] border p-5 shadow-sm backdrop-blur-md sm:rounded-[1.9rem] sm:p-6",
                plan.isPopular
                  ? "border-foreground bg-foreground text-primary-foreground"
                  : "border-border/80 bg-background",
              )}
            >
              {plan.isPopular ? (
                <span className="absolute right-6 top-6 rounded-full bg-background px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground">
                  Popular
                </span>
              ) : null}

              <p
                className={cn(
                  "text-sm font-medium",
                  plan.isPopular ? "text-primary-foreground/74" : "text-foreground/66",
                )}
              >
                {plan.name}
              </p>
              <div className="mt-4 flex items-end gap-1">
                <p className="text-4xl font-semibold tracking-tight">{plan.price}</p>
                {plan.period ? (
                  <p
                    className={cn(
                      "pb-1 text-sm",
                      plan.isPopular ? "text-primary-foreground/74" : "text-foreground/66",
                    )}
                  >
                    {plan.period}
                  </p>
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-3 text-sm leading-7",
                  plan.isPopular ? "text-primary-foreground/80" : "text-foreground/78",
                )}
              >
                {plan.description}
              </p>

              <div className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                        plan.isPopular
                          ? "bg-primary-foreground/14 text-primary-foreground"
                          : "bg-secondary text-foreground",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={
                        plan.isPopular ? "text-primary-foreground/88" : "text-foreground/90"
                      }
                    >
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                asChild
                variant={plan.isPopular ? "secondary" : "default"}
                className={cn(
                  "mt-8 w-full rounded-full text-sm font-medium",
                  plan.isPopular ? "bg-background text-foreground hover:bg-background/90" : "",
                )}
              >
                <Link href={plan.href}>{plan.buttonText}</Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-foreground/62">
          * Refund eligibility is limited and reviewed case by case. It may apply only if you
          followed the platform guidance fully, received a visa rejection, and both the rejection
          and your compliance can be verified.
        </p>

        <div className="mt-12 flex flex-col items-center justify-center space-y-4 sm:mt-14">
          <p className="text-sm font-medium uppercase tracking-wider text-foreground/60">
            Accepted payment methods
          </p>
          <div
            className="flex flex-wrap items-center justify-center gap-4 sm:gap-6"
            role="list"
            aria-label="Accepted payment methods"
          >
            <FaStripe
              className="h-10 w-10 text-[#635BFF] transition-transform hover:scale-110"
              role="listitem"
              aria-label="Stripe"
            />
            <FaCcVisa
              className="h-8 w-8 text-[#1434CB] transition-transform hover:scale-110"
              role="listitem"
              aria-label="Visa"
            />
            <svg
              width="36"
              height="22"
              viewBox="0 0 40 24"
              className="transition-transform hover:scale-110"
              role="listitem"
              aria-label="Mastercard"
            >
              <circle cx="15" cy="12" r="12" fill="#EA001B" />
              <circle cx="25" cy="12" r="12" fill="#FFA200" fillOpacity="0.8" />
            </svg>
            <FaCcAmex
              className="h-8 w-8 text-[#002663] transition-transform hover:scale-110"
              role="listitem"
              aria-label="American Express"
            />
            <FaPaypal
              className="h-8 w-8 text-[#00457C] transition-transform hover:scale-110"
              role="listitem"
              aria-label="PayPal"
            />
            <FaApplePay
              className="h-10 w-10 text-black transition-transform hover:scale-110"
              role="listitem"
              aria-label="Apple Pay"
            />
            <div
              className="flex cursor-default items-center gap-0.5 transition-transform hover:scale-110"
              role="listitem"
              aria-label="Google Pay"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span
                className="pt-[1px] text-[17px] font-medium tracking-tight text-[#5f6368]"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                Pay
              </span>
            </div>
          </div>
        </div>
      </SectionSurface>
    </SectionShell>
  );
}

export function FaqSection() {
  return (
    <SectionShell id="faq">
      <SectionSurface>
        <SectionIntro title="FAQ" subtitle="Everything you need to know" />

        <div className="mx-auto mt-8 max-w-3xl sm:mt-10">
          <Accordion type="single" collapsible className="space-y-4">
            {homepageFaqItems.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
                className="rounded-[1.35rem] border border-border/80 bg-background px-4 shadow-sm sm:rounded-[1.5rem] sm:px-6"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 pr-0 text-sm leading-7 text-foreground/78 sm:pb-6 sm:pr-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-8 rounded-[1.35rem] border border-border/80 bg-background px-4 py-5 shadow-sm sm:rounded-[1.5rem] sm:px-6 sm:py-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-foreground">Choose your next step</p>
              <p className="mt-2 text-sm text-foreground/76">
                Start with self-serve answers, or sign up to get route-specific help inside your
                dashboard once you are ready to work on your own file.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex h-full flex-col rounded-[1.15rem] border border-border/80 bg-muted/35 p-5 text-left">
                <p className="text-base font-semibold text-foreground">Browse the FAQ</p>
                <p className="mt-2 text-sm leading-7 text-foreground/76">
                  Get clear answers on pricing, privacy, visa coverage, refunds, product limits,
                  and how the workflow works.
                </p>
                <div className="mt-auto pt-4">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full border-border/80 bg-background sm:w-auto"
                  >
                    <Link href={"/faq" as Route}>View all FAQs</Link>
                  </Button>
                </div>
              </div>

              <div className="flex h-full flex-col rounded-[1.15rem] border border-border/80 bg-muted/35 p-5 text-left">
                <p className="text-base font-semibold text-foreground">Need personalized help?</p>
                <p className="mt-2 text-sm leading-7 text-foreground/76">
                  Create an account to work through your checklist, upload documents, and open a
                  support ticket from your dashboard once your application is underway.
                </p>
                <div className="mt-auto pt-4">
                  <Button asChild className="w-full rounded-full sm:w-auto">
                    <Link href={"/sign-up" as Route}>Get My Free Review</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionSurface>
    </SectionShell>
  );
}
