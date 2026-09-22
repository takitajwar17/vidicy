import type { Metadata } from "next"
import { VisaPage } from "../_components/visa-page"
import { PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "Canada visa document checklist",
  description:
    "A checklist for Canada Visitor Visas (TRV), Study Permits, and Work Permits. Use it to check your documents against IRCC requirements before you apply.",
  alternates: {
    canonical: "/visas/canada",
  },
})

export default function CanadaVisaPage() {
  return (
    <VisaPage
      heroSubtitle="Canada"
      countryCode="CA"
      heroTitle="Canada Visa Document Requirements"
      heroDescription="This checklist covers Canada visa and permit applications processed by Immigration, Refugees and Citizenship Canada (IRCC). Each route has slightly different requirements, so the documents are grouped by permit type."
      coreDocuments={[
        "Valid passport (must be valid for the duration of your stay)",
        "Completed application form (IMM 5257 for TRV or relevant form)",
        "Passport-sized photos (35×45mm, white background, recent)",
        "Biometrics (required for applicants aged 14 to 79)",
        "Bank statements (last 3–6 months)",
        "Proof of ties to home country",
        "Application fee payment receipt",
        "Letter of invitation (if applicable)",
      ]}
      sections={[
        {
          title: "Temporary Resident Visa - Visitor (TRV)",
          documents: [
            "Purpose of visit letter (tourism, visiting family, business)",
            "Invitation letter from Canadian host with their status documents",
            "Return flight reservation",
            "Hotel bookings or proof of accommodation",
            "Employment letter confirming leave of absence",
            "Proof of sufficient funds for the trip",
            "Previous travel history (passports with stamps)",
          ],
        },
        {
          title: "Study Permit",
          documents: [
            "Letter of acceptance from a Designated Learning Institution (DLI)",
            "Provincial Attestation Letter (PAL) — required since January 2024",
            "Proof of financial support: tuition + CAD $20,635/year for living expenses (adjusted annually by IRCC)",
            "Guaranteed Investment Certificate (GIC) of CAD $20,635 from a participating Canadian bank",
            "IELTS/TOEFL or CELPIP language test results",
            "Academic transcripts and degree certificates",
            "Statement of purpose (study plan)",
          ],
        },
        {
          title: "Work Permit (LMIA-based)",
          documents: [
            "Labour Market Impact Assessment (LMIA) from employer",
            "Job offer letter referencing the LMIA number",
            "Employment contract with salary and duration",
            "Educational credentials and professional certificates",
            "Proof of qualifications for the specific NOC code",
            "Medical exam results (if required for your occupation)",
          ],
        },
        {
          title: "Financial documents",
          documents: [
            "Bank statements for last 3–6 months (certified by bank)",
            "Fixed deposits or investment account statements",
            "Property ownership documents (if applicable)",
            "Sponsorship letter and sponsor's financial proof",
            "For students: GIC of CAD $20,635 from a participating Canadian bank",
            "Scholarship or bursary award letters",
          ],
        },
      ]}
      faqItems={[
        {
          question: "How much money do I need to show for a Canada visitor visa?",
          answer: "There is no fixed amount, but IRCC wants to see that you can cover the trip without working in Canada. For a two-week trip, CAD $2,500 to $5,000 equivalent is often a reasonable range. For longer stays, you should show more.",
        },
        {
          question: "What is a Provincial Attestation Letter (PAL) and do I need one?",
          answer: "Since January 22, 2024, most new international students need a PAL from the province or territory where their school is located before they can apply for a study permit. Your Designated Learning Institution (DLI) can walk you through that process.",
        },
        {
          question: "How long does Canada visitor visa processing take?",
          answer: "Processing times vary a lot, from a few days to several weeks, depending on your citizenship and current IRCC backlogs. Check the IRCC website for the latest estimate and apply well in advance.",
        },
        {
          question: "Can I extend my Canada visitor visa from inside Canada?",
          answer: "Yes. If you need to stay longer, apply online through the IRCC portal at least 30 days before your current status expires. You must stay in Canada while the extension is pending.",
        },
      ]}
      currentVisa="canada"
      lastReviewedAt={PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}
      officialSources={[
        {
          label: "Visit Canada",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html",
        },
        {
          label: "Study permit",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
        },
        {
          label: "Application processing times",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html",
        },
      ]}
      schemaName="Canada Visa Document Requirements Checklist"
      schemaDescription="Document checklist for Canada Temporary Resident Visa, Study Permit, and Work Permit applications."
      schemaItems={[
        "Valid passport",
        "Completed IMM 5257 application form",
        "Passport photos",
        "Biometrics",
        "Bank statements",
        "Proof of ties to home country",
        "Application fee receipt",
        "Letter of invitation (if applicable)",
      ]}
    />
  )
}
