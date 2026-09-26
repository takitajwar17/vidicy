import type { CSSProperties } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileUp,
} from "lucide-react";

import Logo from "@/components/logo";
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

const resultItems = [
  { label: "Missing bank statement", status: "Flagged", icon: AlertCircle },
  { label: "Passport scan readable", status: "Passed", icon: CheckCircle2 },
  { label: "Client report ready", status: "Ready", icon: FileCheck2 },
] as const;

export const metadata = constructMetadata({
  title: "Vidicy Agency",
  description: "Bulk visa application review for travel and visa agencies.",
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
          <Link
            className="flex items-center text-gray-900"
            href="/"
            aria-label="Vidicy Agency home"
          >
            <Logo
              alt="Vidicy"
              className="h-7 w-auto"
              surface="light"
              variant="horizontal"
            />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {["Product", "Workflow", "Reports", "Security"].map((item) => (
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

        <div className="relative z-10 flex min-h-[calc(650px-72px)] -translate-y-2 flex-col items-center justify-center px-6 py-16 text-center md:-translate-y-3 md:px-12 lg:px-20">
          <AnimatedText
            as="h1"
            className="max-w-5xl text-4xl font-normal leading-[0.94] text-gray-900 md:text-6xl lg:text-7xl"
            style={headingStyle}
            text="Review visa applications faster in scale"
          />
          <AnimatedText
            className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 md:text-xl"
            text="Vidicy helps agencies check client files for missing documents, mistakes, and inconsistencies before submission."
          />

          <div className="mx-auto mt-9 w-full max-w-2xl rounded-2xl bg-[#2B3534] p-3 text-left shadow-2xl">
            <div className="grid items-stretch gap-3 md:grid-cols-[1.05fr_0.95fr]">
              <div className="relative flex flex-col rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-3 pb-12">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-800">
                    <FileUp aria-hidden="true" className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-medium text-white">
                      Upload client documents
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">
                      Passport, forms, bank statements, and supporting files.
                      Vidicy checks them and returns review results.
                    </p>
                  </div>
                </div>

                <label
                  className="absolute bottom-4 left-1/2 inline-flex h-9 w-fit -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-white border-b-gray-300 border-t-white bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#eef2f7_100%)] px-4 text-xs font-semibold text-gray-800 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_-7px_12px_rgba(15,23,42,0.10)_inset,0_10px_22px_rgba(0,0,0,0.28)] ring-1 ring-gray-950/5 transition-[background-image,box-shadow] duration-200 hover:bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_48%,#f1f5f9_100%)] hover:shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_-7px_12px_rgba(15,23,42,0.11)_inset,0_10px_22px_rgba(0,0,0,0.28)] active:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_-5px_10px_rgba(15,23,42,0.12)_inset,0_8px_18px_rgba(0,0,0,0.24)]"
                  htmlFor="agency-file-upload"
                >
                  <FileUp
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                  />
                  Upload files
                </label>
                <input
                  className="sr-only"
                  id="agency-file-upload"
                  multiple
                  type="file"
                />
              </div>

              <div className="rounded-xl border border-white/10 p-3">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      Review results
                    </p>
                    <p className="text-[11px] leading-4 text-gray-400">
                      Checks, issues, and reports in one queue.
                    </p>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-gray-300">
                    <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="space-y-2">
                  {resultItems.map(({ icon: Icon, label, status }) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white"
                      key={label}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Icon
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-gray-300"
                        />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-gray-400">
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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
            text="Turn manual review into a repeatable workflow"
          />
          <AnimatedText
            className="max-w-sm text-right text-lg leading-8 text-gray-300 md:justify-self-end md:text-xl"
            text="Built for visa and travel agencies that need queues, issue tracking, and client-ready reports without losing control of the final decision."
          />
        </div>
      </section>
    </main>
  );
}
