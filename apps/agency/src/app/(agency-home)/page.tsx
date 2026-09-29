import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import Logo from "@/components/logo";
import Footer from "@/components/sections/footer";
import { marketingTopBarLinks } from "@/lib/config";
import { constructMetadata } from "@/lib/utils";

const heroVideoUrl =
  "/videos/vidicy-hero.mp4";

const workflowHighlights = [
  {
    title: "Move cases faster",
    description: "One queue for every client file.",
  },
  {
    title: "Catch issues earlier",
    description: "Flag gaps before submission.",
  },
  {
    title: "Send clearer fixes",
    description: "Share client-ready action lists.",
  },
] as const;

const metrics = [
  { value: "10x", label: "review capacity target" },
  { value: "30 sec", label: "to spot missing documents" },
  { value: "1 click", label: "to create client follow-ups" },
] as const;

export const metadata = constructMetadata({
  title: "AI Visa Review Software for High-Volume Agency Teams",
  description:
    "Review client visa files faster with AI document checks, missing requirement detection, case tracking, and client-ready follow-ups for agency teams.",
  alternates: {
    canonical: "/",
  },
});

function AnimatedText({
  as: Component = "p",
  text,
  className,
}: {
  as?: "h1" | "h2" | "p";
  text: string;
  className?: string;
}) {
  const words = text.split(" ");

  return (
    <Component aria-label={text} className={className}>
      {words.map((word, index) => (
        <span
          aria-hidden="true"
          className="inline-block opacity-0 animate-fadeUp motion-reduce:animate-none motion-reduce:opacity-100"
          key={`${word}-${index}`}
          style={{
            animationDelay: `${index * 0.1}s`,
            animationFillMode: "forwards",
          }}
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </Component>
  );
}

export default function Home() {
  return (
    <>
      <main className="public-site-font-system public-landing-surface min-h-screen public-landing-ink">
        <section className="public-landing-surface relative overflow-hidden pb-0">
          <video
            aria-hidden="true"
            autoPlay
            className="absolute inset-x-0 top-0 h-[84vh] w-full object-cover object-bottom"
            loop
            muted
            playsInline
            preload="metadata"
            src={heroVideoUrl}
          />
          <div className="public-landing-media-fade pointer-events-none absolute inset-x-0 top-[calc(84vh-2rem)] h-8" />

          <nav className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-6 md:px-12 lg:px-20">
            <Link
              aria-label="Vidicy Agency home"
              className="public-landing-ink flex items-center"
              href="/"
            >
              <Logo
                alt="Vidicy"
                className="h-5 w-auto sm:h-7"
                surface="light"
                variant="horizontal"
              />
            </Link>

            <div className="hidden items-center gap-7 lg:flex">
              {marketingTopBarLinks.map((item) => (
                <Link
                  className="public-nav-link text-sm font-semibold transition-colors"
                  href={item.href as Route}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                className="public-auth-link px-1 text-sm font-semibold transition-colors sm:px-2"
                href="/sign-in"
              >
                Log in
              </Link>
              <Link
                className="public-button-primary rounded-2xl px-3.5 py-2 text-sm font-semibold transition-colors sm:px-4 sm:py-2.5"
                href="/sign-up"
              >
                Sign up
              </Link>
            </div>
          </nav>

          <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-5 pb-8 pt-10 text-center sm:px-6 md:px-12 md:pt-10 lg:px-20">
            <AnimatedText
              as="h1"
              className="public-display-tight max-w-[20rem] text-[2.75rem] font-normal leading-[0.92] sm:max-w-3xl sm:text-5xl md:max-w-5xl md:text-6xl lg:text-7xl"
              text="10x your agency's visa application review capacity."
            />
            <AnimatedText
              className="public-landing-muted mt-5 max-w-[21rem] text-base leading-7 sm:max-w-3xl sm:text-lg md:text-xl"
              text="Vidicy helps visa and travel agencies check client files in bulk, flag missing documents and inconsistencies, and produce clear issue lists."
            />

            <div className="mt-7 flex w-full max-w-[21rem] flex-col gap-3 sm:max-w-2xl sm:flex-row sm:justify-center">
              <Link
                className="public-button-primary-strong inline-flex h-12 items-center justify-center rounded-2xl px-7 text-sm font-bold ring-1 ring-primary/10 transition-colors sm:h-14 sm:px-10 sm:text-base"
                href="/sign-up"
              >
                Start a pilot
              </Link>
              <Link
                className="public-button-secondary inline-flex h-12 items-center justify-center rounded-2xl border px-7 text-sm font-bold backdrop-blur transition-colors sm:h-14 sm:px-10 sm:text-base"
                href="/enterprise"
              >
                Request a demo
              </Link>
            </div>

            <div className="public-landing-media-frame mt-8 aspect-[2830/1594] w-full max-w-[21rem] overflow-hidden rounded-2xl border sm:max-w-3xl md:max-w-5xl md:rounded-3xl">
              <Image
                alt="Vidicy agency dashboard showing application review results"
                className="h-full w-full object-cover"
                height={1594}
                priority
                sizes="(min-width: 1024px) 64rem, (min-width: 640px) 48rem, 21rem"
                src="/dashboard.png"
                width={2830}
              />
            </div>

            <div className="public-landing-panel public-on-dark relative -mt-8 w-full max-w-[21rem] rounded-2xl border border-white/15 p-4 text-left sm:max-w-3xl md:-mt-20 md:max-w-6xl md:p-6 lg:-mt-24">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="public-on-dark-subtle text-[10px] font-bold uppercase tracking-[0.16em] sm:text-[11px]">
                    What your review team gets
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {workflowHighlights.map((highlight) => (
                      <div key={highlight.title}>
                        <p className="text-base font-semibold leading-none sm:text-lg">
                          {highlight.title}
                        </p>
                        <p className="public-on-dark-subtle mt-1.5 text-xs leading-5">
                          {highlight.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center sm:gap-4">
                  {metrics.map((metric) => (
                    <div key={metric.label}>
                      <p className="text-2xl font-medium leading-none sm:text-3xl">
                        {metric.value}
                      </p>
                      <p className="public-on-dark-subtle mt-2 text-[10px] leading-4 sm:text-[11px]">
                        {metric.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="public-landing-surface px-5 pb-20 pt-4 sm:px-6 md:px-12 md:pb-28 md:pt-10 lg:px-20">
          <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2 md:items-start">
            <AnimatedText
              as="h2"
              className="public-display-tight public-on-dark max-w-3xl text-4xl font-normal leading-[0.95] sm:text-5xl md:text-6xl"
              text="Turn manual review into a repeatable workflow"
            />
            <AnimatedText
              className="public-on-dark-muted max-w-xl text-lg leading-8 md:justify-self-end md:text-right md:text-2xl md:leading-10"
              text="Review more applications each day, catch issues before they slow your team down, and give clients clear fixes in minutes."
            />
          </div>
        </section>
      </main>
      <Footer className="mt-0 border-t-0" />
    </>
  );
}
