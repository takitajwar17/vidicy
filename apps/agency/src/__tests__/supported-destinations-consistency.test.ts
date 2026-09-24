import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISA_TYPES,
  DESTINATION_COUNTRIES,
  VISA_TYPES_BY_DESTINATION,
} from "@/app/(dashboard)/dashboard/applications/new/new-application-constants";

type VisaTypeOption = { value: string; label: string };

function parseSupportedDestinationsDoc(markdown: string): {
  destinations: string[];
  visaTypesByDestination: Record<string, VisaTypeOption[]>;
  fallbackVisaTypes: VisaTypeOption[];
} {
  const lines = markdown.split(/\r?\n/);
  const destinations: string[] = [];
  const visaTypesByDestination: Record<string, VisaTypeOption[]> = {};
  const fallbackVisaTypes: VisaTypeOption[] = [];

  let currentSection: string | "__fallback__" | null = null;
  let inTable = false;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const rawHeading = headingMatch[1].trim();

      if (rawHeading.startsWith("Fallback (unlisted destinations)")) {
        currentSection = "__fallback__";
        inTable = false;
        continue;
      }

      const destination = /^[\x00-\x7F]/.test(rawHeading[0])
        ? rawHeading
        : rawHeading.replace(/^\S+\s+/, "");

      currentSection = destination;
      destinations.push(destination);
      visaTypesByDestination[destination] = [];
      inTable = false;
      continue;
    }

    if (!currentSection) continue;

    if (/^\|\s*Value\s*\|\s*Label\s*\|$/.test(line.trim())) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;
    if (/^\|\s*---\s*\|\s*---\s*\|$/.test(line.trim())) continue;

    const rowMatch = line.match(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/);
    if (!rowMatch) {
      // Keep scanning for section notes/blank lines, but leave table mode on.
      continue;
    }

    const row = { value: rowMatch[1], label: rowMatch[2] };
    if (currentSection === "__fallback__") {
      fallbackVisaTypes.push(row);
    } else {
      visaTypesByDestination[currentSection].push(row);
    }
  }

  return { destinations, visaTypesByDestination, fallbackVisaTypes };
}

describe("supported destinations consistency", () => {
  it("matches docs/SUPPORTED_DESTINATIONS.md exactly (countries + visa type names)", () => {
    const docPath = path.join(process.cwd(), "docs", "SUPPORTED_DESTINATIONS.md");
    const markdown = fs.readFileSync(docPath, "utf8");
    const parsed = parseSupportedDestinationsDoc(markdown);

    expect(DESTINATION_COUNTRIES).toEqual(parsed.destinations);
    expect(Object.keys(VISA_TYPES_BY_DESTINATION)).toEqual(parsed.destinations);

    for (const destination of parsed.destinations) {
      expect(VISA_TYPES_BY_DESTINATION[destination]).toEqual(
        parsed.visaTypesByDestination[destination]
      );
    }

    expect(DEFAULT_VISA_TYPES).toEqual(parsed.fallbackVisaTypes);
  });
});
