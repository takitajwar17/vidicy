import type { Metadata } from "next"
import { VisaPage } from "../_components/visa-page"
import { PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "UK visa document checklist",
  description:
    "A checklist for UK Standard Visitor, Skilled Worker, and Student visas. Use it to spot missing documents before you submit.",
  alternates: {
    canonical: "/visas/uk",
  },
})

export default function UKVisaPage() {
  return (
    <VisaPage
      heroSubtitle="United Kingdom"
      countryCode="GB"
      heroTitle="UK Visa Document Requirements"
      heroDescription="This checklist covers UK visa applications managed by UK Visas and Immigration (UKVI). Requirements vary by route, so the details are grouped by visa type instead of squeezed into one generic list."
      coreDocuments={[
        "Valid passport (in date for the full duration of your stay)",
        "Completed UK visa online application form",
        "Passport-sized photos (45×35mm, light grey or cream background)",
        "Biometric enrolment (at a UKVCAS service point)",
        "Bank statements (last 6 months)",
        "Proof of accommodation in the UK",
        "Travel history (previous passports if applicable)",
        "Visa application fee payment confirmation",
      ]}
      sections={[
        {
          title: "Standard visitor visa",
          documents: [
            "Letter explaining purpose and duration of visit",
            "Proof of employment and employer leave approval",
            "Evidence of ties to home country (property, family, job)",
            "Evidence you can fund the trip without working in the UK",
            "Invitation letter from UK host (if staying with someone)",
            "Return flight reservation",
            "Hotel or accommodation booking",
          ],
        },
        {
          title: "Skilled Worker visa (formerly Tier 2)",
          documents: [
            "Certificate of Sponsorship (COS) reference number",
            "Job offer letter from UK employer with COS details",
            "Proof of English language proficiency (CEFR B1 or above)",
            "Educational qualifications and degree certificates",
            "TB test certificate (if required for your country)",
            "Previous immigration history documentation",
            "Proof of personal savings (if below salary threshold)",
          ],
        },
        {
          title: "Student visa (formerly Tier 4)",
          documents: [
            "Confirmation of Acceptance for Studies (CAS) reference number",
            "Proof of English language proficiency (SELT from approved provider)",
            "ATAS certificate (if your course requires Academic Technology Approval Scheme)",
            "Proof of financial requirements (28 consecutive days bank statements)",
            "Parental consent letter (if under 18)",
            "Academic transcripts and qualifications",
            "TB test certificate (if applicable)",
          ],
        },
        {
          title: "Financial evidence",
          documents: [
            "Bank statements must cover 28 consecutive days ending within 31 days of application",
            "Funds must be present for the full 28-day period (no recent large deposits)",
            "If self-employed: company accounts or audited financial statements",
            "Official bank letters on bank letterhead",
            "Loan documents (if funding is from a loan)",
          ],
        },
      ]}
      faqItems={[
        {
          question: "How long should my bank statements be for a UK visa?",
          answer: "For a Standard Visitor visa, 3 to 6 months of statements is typical. For a Student visa, UKVI wants 28 consecutive days of statements ending within 31 days of your application date. The money has to stay there the whole time, so a large recent deposit can raise questions.",
        },
        {
          question: "Do I need to show the full cost of my UK studies in my bank account?",
          answer: "For a Student visa, you need to show the first year's tuition fees, if they have not already been paid, plus living costs of £1,529 a month for London or £1,171 a month outside London, for up to 9 months. Your CAS shows how much tuition has already been paid.",
        },
        {
          question: "What is a CAS number and how do I get one?",
          answer: "A Confirmation of Acceptance for Studies (CAS) is the reference number your UK school gives you after it confirms your place. You cannot apply for a Student visa without it.",
        },
        {
          question: "Why do UK visa applications get refused?",
          answer: "Common reasons include money not being held for the full 28 days, unexplained large deposits, weak evidence that you will return home, mismatches between the application form and supporting documents, and not disclosing previous visa refusals.",
        },
      ]}
      currentVisa="uk"
      lastReviewedAt={PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}
      officialSources={[
        {
          label: "Standard Visitor visa",
          href: "https://www.gov.uk/standard-visitor",
        },
        {
          label: "Student visa money requirements",
          href: "https://www.gov.uk/student-visa/money",
        },
        {
          label: "Skilled Worker visa",
          href: "https://www.gov.uk/skilled-worker-visa",
        },
      ]}
      schemaName="UK Visa Document Requirements Checklist"
      schemaDescription="Document checklist for UK Standard Visitor, Skilled Worker, and Student visa applications."
      schemaItems={[
        "Valid passport",
        "Completed UK visa application form",
        "Passport photos",
        "Biometric enrolment confirmation",
        "Bank statements (6 months)",
        "Proof of accommodation",
        "Visa fee payment",
        "Travel history",
      ]}
    />
  )
}
