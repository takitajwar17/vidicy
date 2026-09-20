import type { CSSProperties } from "react";

import { Globe } from "lucide-react";
import ReactCountryFlag from "react-country-flag";

import Marquee from "@/components/magicui/marquee";
import {
  SectionShell,
  SectionSurface,
} from "@/components/homepage/section-primitives";
import { cn } from "@/lib/utils";

const destinations = [
  { countryCode: "US", text: "United States" },
  { countryCode: "GB", text: "United Kingdom" },
  { countryCode: "CA", text: "Canada" },
  { countryCode: "AU", text: "Australia" },
  { countryCode: "DE", text: "Germany" },
  { countryCode: "FR", text: "France" },
  { countryCode: "NL", text: "Netherlands" },
  { countryCode: "SE", text: "Sweden" },
  { countryCode: "DK", text: "Denmark" },
  { countryCode: "NO", text: "Norway" },
  { countryCode: "FI", text: "Finland" },
  { countryCode: "CH", text: "Switzerland" },
  { countryCode: "AT", text: "Austria" },
  { countryCode: "BE", text: "Belgium" },
  { countryCode: "IE", text: "Ireland" },
  { countryCode: "EU", text: "Schengen Area (Europe)" },
  { countryCode: "NZ", text: "New Zealand" },
  { countryCode: "JP", text: "Japan" },
  { countryCode: "SG", text: "Singapore" },
  { countryCode: "KR", text: "South Korea" },
] as const;

const destinationRailRows = [
  destinations.slice(0, 7),
  destinations.slice(7, 14),
  destinations.slice(14),
] as const;

const mobileDestinationRailRows = [destinations.slice(0, 10), destinations.slice(10)] as const;

function CountryRailRow({
  items,
  duration,
  reverse = false,
  compact = false,
}: {
  items: readonly { countryCode: string; text: string }[];
  duration: number;
  reverse?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <Marquee
        reverse={reverse}
        repeat={2}
        className="w-full min-w-0 p-0 [--gap:0rem]"
        style={{ "--duration": `${duration}s` } as CSSProperties}
      >
        {items.map((item) => (
          <div key={item.text} className="flex items-center">
            <span
              className={cn(
                "inline-flex items-center font-medium tracking-tight text-foreground/88",
                compact
                  ? "gap-1 px-2 py-1.5 text-[11px]"
                  : "gap-1.5 px-2.5 py-2 text-[13px] sm:px-3 sm:text-[14px]",
              )}
            >
              <span className="inline-flex overflow-hidden rounded-[3px] ring-1 ring-foreground/10 shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
                <ReactCountryFlag
                  countryCode={item.countryCode}
                  svg
                  alt={`${item.text} flag`}
                  style={{ width: "1rem", height: "0.82rem" }}
                />
              </span>
              <span className="whitespace-nowrap">{item.text}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn("h-1 w-1 rounded-full bg-border/85", compact ? "mx-1" : "mx-1.5")}
            />
          </div>
        ))}
      </Marquee>
    </div>
  );
}

export function DestinationsStrip() {
  return (
    <SectionShell id="coverage" className="pb-6 pt-10 sm:pt-12 md:pt-16">
      <SectionSurface className="px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.64fr)_minmax(0,1.36fr)] xl:items-center">
          <div className="min-w-0 flex flex-col gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-[11px] sm:tracking-[0.22em]">
              <Globe className="h-3.5 w-3.5" />
              <span>Destination-specific coverage</span>
            </div>
            <div className="space-y-3">
              <h2 className="font-display text-[2.2rem] leading-[0.96] tracking-tight text-foreground [font-family:var(--font-display)] sm:text-[2.7rem] md:text-[3.2rem]">
                Live routes already built into Vidicy
              </h2>
              <p className="max-w-xl text-sm leading-6 text-foreground/72 sm:text-base sm:leading-7">
                The destination and filing route you choose shape the checklist, review logic, and
                guidance. Vidicy already supports 20 live destinations with embassy-aware flows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-foreground/66 sm:text-sm">
              <span className="rounded-full border border-border/70 bg-background px-3 py-1.5">
                20 destinations live
              </span>
              <span className="rounded-full border border-border/70 bg-background px-3 py-1.5">
                Live destinations
              </span>
            </div>
          </div>

          <div className="min-w-0 rounded-[1.6rem] border border-border/75 bg-background/78 p-3 shadow-sm sm:rounded-[1.85rem] sm:p-4">
            <div className="min-w-0 rounded-[1.3rem] border border-border/80 bg-background px-2 py-2 sm:rounded-[1.5rem] sm:px-3 sm:py-3">
              <div className="space-y-1.5 sm:hidden">
                <CountryRailRow items={mobileDestinationRailRows[0]} duration={22} compact />
                <CountryRailRow items={mobileDestinationRailRows[1]} duration={24} reverse compact />
              </div>

              <div className="hidden sm:block">
                <div className="space-y-2 sm:space-y-2.5">
                  <CountryRailRow items={destinationRailRows[0]} duration={28} />
                  <CountryRailRow items={destinationRailRows[1]} duration={32} reverse />
                  <CountryRailRow items={destinationRailRows[2]} duration={26} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionSurface>
    </SectionShell>
  );
}
