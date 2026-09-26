import type { CSSProperties } from "react";
import Link from "next/link";
import { BarChart3, Send, Stethoscope } from "lucide-react";

import { constructMetadata } from "@/lib/utils";

const heroVideoUrl =
  "/videos/vidicy-hero.mp4";

const headingStyle: CSSProperties = {
  fontFamily: "var(--font-inria), 'Inria Serif', serif",
  letterSpacing: "-0.07em",
};

const bodyStyle: CSSProperties = {
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

const actionItems = [
  { label: "Start Wellness Check", icon: null },
  { label: "Chat with MedAI", icon: Stethoscope },
  { label: "View Insights", icon: BarChart3 },
] as const;

export const metadata = constructMetadata({
  title: "Logopipsum",
  description: "Turn medical insights into personalized wellness plans.",
  alternates: {
    canonical: "/",
  },
});

function AnimatedText({
  as: Component = "p",
  text,
  className,
  style,
}: {
  as?: "h1" | "h2" | "p";
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const words = text.split(" ");

  return (
    <Component aria-label={text} className={className} style={style}>
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
    <main className="min-h-screen bg-[#2B3534] text-gray-900" style={bodyStyle}>
      <section className="relative min-h-[650px] overflow-hidden bg-[#f4f4f2] md:h-[650px]">
        <video
          aria-hidden="true"
          autoPlay
          className="absolute inset-0 h-full w-full object-cover object-bottom"
          loop
          muted
          playsInline
          preload="metadata"
          src={heroVideoUrl}
        />

        <nav className="relative z-20 flex items-center justify-between px-6 py-4 md:px-12 lg:px-20">
          <Link className="flex items-center gap-2 text-gray-900" href="/" aria-label="Logopipsum home">
            <svg
              aria-hidden="true"
              className="h-7 w-9 text-[#171a1f] md:h-8 md:w-10"
              fill="none"
              viewBox="-5 0 61 44"
            >
              <path d="M18.2 1.8h18.1L25.8 12.3H7.7L18.2 1.8Z" fill="currentColor" />
              <path d="M6.4 13.7h18.1L14 24.2H-4.1L6.4 13.7Z" fill="currentColor" />
              <path d="M30.2 13.7h18.1L37.8 24.2H19.7l10.5-10.5Z" fill="currentColor" />
              <path d="M18.2 25.7h18.1L25.8 36.2H7.7l10.5-10.5Z" fill="currentColor" />
              <path d="M37.8 1.8h10.5l-10.5 10.5H27.3L37.8 1.8Z" fill="currentColor" />
              <path d="M6.4 25.7h10.5L6.4 36.2H-4.1L6.4 25.7Z" fill="currentColor" />
            </svg>
            <span className="text-xl font-black italic leading-none tracking-[-0.09em] text-[#171a1f] md:text-2xl">
              Logopipsum
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {["Home", "Services", "Team", "Membership", "Resources"].map((item) => (
              <Link
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                href="/"
                key={item}
              >
                {item}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="px-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900"
              href="/sign-in"
            >
              Login
            </Link>
            <Link
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-900"
              href="/sign-up"
            >
              Sign up
            </Link>
          </div>
        </nav>

        <div className="relative z-10 flex min-h-[calc(650px-72px)] flex-col items-center justify-center px-6 py-16 text-center md:px-12 lg:px-20">
          <AnimatedText
            as="h1"
            className="max-w-5xl text-4xl font-normal leading-[0.94] text-gray-900 md:text-6xl lg:text-7xl"
            style={headingStyle}
            text="Smart Care Begins with Data + Insight"
          />
          <AnimatedText
            className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 md:text-xl"
            text="Turn medical insights into personalized wellness plans."
          />

          <div className="mx-auto mt-10 w-full max-w-xl rounded-2xl bg-[#2B3534] p-4 text-left shadow-2xl">
            <textarea
              className="min-h-[60px] w-full resize-none bg-transparent px-2 py-1 text-base text-white outline-none placeholder:text-gray-400"
              placeholder="Welcome to Vitara — your care intelligence hub!"
            />

            <div className="mt-4 flex items-center gap-3 border-t border-white/15 pt-4">
              <div className="relative min-w-0 flex-1">
                <div className="scrollbar-hide flex gap-2 overflow-x-auto pr-10">
                  {actionItems.map(({ icon: Icon, label }) => (
                    <button
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                      key={label}
                      type="button"
                    >
                      {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
                      {label}
                    </button>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#2B3534] to-transparent" />
              </div>

              <button
                aria-label="Send"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-gray-800 transition-colors hover:bg-gray-100"
                type="button"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-b from-transparent to-[#2B3534]" />
      </section>

      <section className="bg-[#2B3534] px-6 py-24 md:px-12 lg:px-20">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-2 md:items-start">
          <AnimatedText
            as="h2"
            className="max-w-3xl text-3xl font-normal leading-[0.98] text-white md:text-5xl lg:text-6xl"
            style={headingStyle}
            text="Your proactive shield against disease"
          />
          <AnimatedText
            className="max-w-sm text-right text-lg leading-8 text-gray-300 md:justify-self-end md:text-xl"
            text="We blend smart technology & clinical wisdom to provide tailored, preventive, & insight-rich medicine for tomorrow."
          />
        </div>
      </section>
    </main>
  );
}
