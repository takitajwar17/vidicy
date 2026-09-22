import type { Metadata } from "next"
import { VisaPage } from "../_components/visa-page"
import { PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "Schengen visa document checklist",
  description:
    "A checklist for Schengen visas across 29 member states: travel insurance, funds, accommodation, and embassy-specific details that vary by destination.",
  alternates: {
    canonical: "/visas/schengen",
  },
})

export default function SchengenVisaPage() {
  return (
    <VisaPage
      heroSubtitle="Schengen Area"
      countryCode="EU"
      heroTitle="Schengen Visa Document Requirements"
      heroDescription="This checklist covers Schengen visa applications across all 29 member states. The core requirements are shared, but the details still vary a little by country, so the checklist adjusts to your destination embassy."
      coreDocuments={[
        "Valid passport (min. 3 months validity after intended departure, issued within previous 10 years, with at least 2 blank pages)",
        "Completed Schengen visa application form",
        "Passport-sized photos (35×45mm, white or light grey background, recent)",
        "Travel medical insurance (min. €30,000 coverage, valid in all Schengen states)",
        "Round-trip flight reservations or itinerary",
        "Proof of accommodation (hotel bookings, host invitation letter)",
        "Bank statements (last 3 months showing sufficient funds)",
        "Proof of employment, enrollment, or self-employment",
        "Visa fee payment (€90 for adults, €45 for children 6–11)",
      ]}
      sections={[
        {
          title: "Financial Documentation",
          documents: [
            "Bank statements (last 3 months, signed and stamped by bank)",
            "Payslips (last 3 months)",
            "Income tax returns or tax clearance certificate",
            "Sponsorship letter with sponsor's bank statements (if applicable)",
            "Scholarship letter (if applicable for students)",
            "Proof of accommodation costs already paid",
          ],
        },
        {
          title: "Employment & Ties to Home Country",
          documents: [
            "Letter from employer stating position, salary, and approved leave",
            "Employment contract",
            "Leave approval letter from employer",
            "Business registration (if self-employed)",
            "Property ownership documents or lease agreement",
            "Marriage certificate or family registration (if applicable)",
          ],
        },
        {
          title: "For Students",
          documents: [
            "Enrollment certificate from home university",
            "Letter from university confirming academic status",
            "Student ID card",
            "Financial sponsor declaration",
            "Conference or course invitation letter (if applicable)",
          ],
        },
        {
          title: "Country-Specific Notes",
          documents: [
            "France: Visa application via France-Visas portal",
            "Germany: Appointment at German embassy/consulate or VFS Global",
            "Italy: Additional proof of accommodation often required",
            "Spain: Consular requirements can be stricter for first-time applicants",
            "Netherlands: Full itinerary often checked more carefully",
            "Greece: Hotel bookings must cover entire stay",
          ],
        },
      ]}
      faqItems={[
        {
          question: "Which country's Schengen embassy should I apply to?",
          answer: "Apply to the embassy of the country where you will spend the most days. If your trip is split evenly, apply to the country you enter first.",
        },
        {
          question: "How much money do I need per day for a Schengen visa?",
          answer: "Requirements vary by country. Germany usually asks for about €45 a day. France ranges from about €32 a day with private accommodation to €65 a day with a hotel booking. What matters most is showing that your total funds cover the whole stay and come from a stable source.",
        },
        {
          question: "Is travel insurance mandatory for a Schengen visa?",
          answer: "Yes. Travel medical insurance with at least €30,000 in coverage is required for all Schengen visa applications. The policy has to be valid in every Schengen country for the length of your stay.",
        },
        {
          question: "Why do Schengen visa applications get rejected?",
          answer: "The most common reasons are weak financial proof, limited ties to home, mismatched documents, insurance gaps, and incomplete forms.",
        },
      ]}
      currentVisa="schengen"
      lastReviewedAt={PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}
      officialSources={[
        {
          label: "European Commission Schengen visa guidance",
          href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en",
        },
        {
          label: "EU Visa Code",
          href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02009R0810-20240201",
        },
      ]}
      schemaName="Schengen Visa Document Requirements Checklist"
      schemaDescription="Document checklist for Schengen visa applications covering all 29 Schengen member states."
      schemaItems={[
        "Valid passport",
        "Completed Schengen application form",
        "Passport photos",
        "Travel medical insurance (€30,000 minimum)",
        "Flight reservations",
        "Proof of accommodation",
        "Bank statements",
        "Employment proof",
        "Visa fee payment",
      ]}
    />
  )
}
