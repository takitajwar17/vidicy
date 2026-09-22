import type { Metadata } from "next"
import { VisaPage } from "../_components/visa-page"
import { PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "US visa document checklist",
  description:
    "A practical checklist for US visa routes, including B1/B2, F-1, H-1B, and O-1. Use it to catch missing documents and obvious issues before your interview.",
  alternates: {
    canonical: "/visas/us",
  },
})

export default function USVisaPage() {
  return (
    <VisaPage
      heroSubtitle="United States"
      countryCode="US"
      heroTitle="US Visa Document Requirements"
      heroDescription="This checklist covers the documents people most often need for US visa applications, from tourist and student routes to specialty work and extraordinary ability cases. Missing one item can slow the process or lead to a refusal."
      coreDocuments={[
        "Valid passport (min. 6 months validity beyond intended stay)",
        "Completed DS-160 online application form",
        "Visa interview appointment confirmation page",
        "Passport-sized photos (2×2 inches, white background)",
        "Bank statements (last 3–6 months)",
        "Proof of ties to home country (property, family, employment)",
        "MRV visa application fee receipt",
        "Travel itinerary or flight reservation",
      ]}
      sections={[
        {
          title: "B1/B2 tourist and business visa",
          documents: [
            "Invitation letter (if visiting family or attending meetings)",
            "Hotel or accommodation booking confirmation",
            "Proof of employment or business ownership",
            "Income tax returns (last 2 years)",
            "Property ownership documents or lease agreement",
            "Bank statements showing consistent income",
            "Letter from employer confirming leave of absence",
          ],
        },
        {
          title: "F-1 student visa",
          documents: [
            "Form I-20 (Certificate of Eligibility) from the US school",
            "SEVIS fee receipt (I-901 payment confirmation)",
            "Acceptance letter from accredited US institution",
            "Academic transcripts, diplomas, and degrees",
            "Proof of financial support (sponsor bank statements or scholarships)",
            "English proficiency scores (TOEFL, IELTS, or Duolingo)",
            "Financial affidavit (Form I-134 if sponsored)",
          ],
        },
        {
          title: "H-1B specialty occupation visa",
          documents: [
            "Form I-129 petition approval notice (I-797)",
            "Labor Condition Application (LCA) from the Department of Labor",
            "Job offer letter specifying role, salary, and duration",
            "Educational degrees, transcripts, and certifications",
            "Professional license (if required for the occupation)",
            "Evidence of specialty occupation qualifications",
            "Resume/CV with full employment history",
          ],
        },
        {
          title: "O-1 extraordinary ability visa",
          documents: [
            "Evidence of extraordinary ability (awards, publications, media coverage)",
            "Peer review letters from recognized experts in the field",
            "Contracts and offer letters from US employer or agent",
            "Itinerary of events or engagements in the US",
            "Critical role evidence (leading or starring role)",
            "Evidence of high salary or high remuneration",
          ],
        },
      ]}
      faqItems={[
        {
          question: "How far in advance should I apply for a US visa?",
          answer: "Apply at least 3 to 4 months before you travel. Interview wait times change a lot by embassy and season, and some locations back up for months during peak periods.",
        },
        {
          question: "How much bank balance is required for a US B1/B2 visa?",
          answer: "There is no fixed minimum. You need to show that you can cover the trip without working in the US. A few thousand dollars may be enough for a short trip, but stable income and a clean bank history matter more than one balance number.",
        },
        {
          question: "Can I apply for a US visa without a confirmed flight booking?",
          answer: "Yes. A flight reservation is usually enough, so you do not need a paid ticket. What matters is showing a believable travel plan, and some consulates look more closely at this than others.",
        },
        {
          question: "How does AI document checking help with US visa applications?",
          answer: "It helps you catch gaps and contradictions before an officer does. The AI looks for mismatched dates, missing details, bank patterns, and inconsistencies across the documents you upload.",
        },
      ]}
      currentVisa="us"
      lastReviewedAt={PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}
      officialSources={[
        {
          label: "U.S. visas overview",
          href: "https://travel.state.gov/content/travel/en/us-visas.html",
        },
        {
          label: "Visa service fees",
          href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html",
        },
        {
          label: "Visa appointment wait times",
          href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/wait-times.html",
        },
      ]}
      schemaName="US Visa Document Requirements Checklist"
      schemaDescription="Document checklist for US visa applications including B1/B2, F-1, H-1B, and O-1 visas."
      schemaItems={[
        "Valid passport",
        "DS-160 application form",
        "Visa interview confirmation",
        "Passport photos",
        "Bank statements",
        "Proof of ties to home country",
        "MRV fee receipt",
        "Travel itinerary",
      ]}
    />
  )
}
