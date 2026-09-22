import type { Metadata } from "next"
import { VisaPage } from "../_components/visa-page"
import { PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "Australia visa document checklist",
  description:
    "A checklist for Australia Visitor (subclass 600), Student (subclass 500), and Skilled visas. Use it to check your documents against Home Affairs requirements.",
  alternates: {
    canonical: "/visas/australia",
  },
})

export default function AustraliaVisaPage() {
  return (
    <VisaPage
      heroSubtitle="Australia"
      countryCode="AU"
      heroTitle="Australia Visa Document Requirements"
      heroDescription="This checklist covers Australian visa applications processed by the Department of Home Affairs. All Australian visas are lodged online through ImmiAccount, so it helps to check the documents before you submit."
      coreDocuments={[
        "Valid passport (min. 6 months validity beyond intended stay)",
        "Completed online visa application via ImmiAccount",
        "Passport-sized photos (35–40×45–50mm, white or light grey background)",
        "Biometrics (if required based on nationality)",
        "Bank statements (last 3–6 months)",
        "Health insurance or evidence of coverage",
        "Application fee payment confirmation",
        "Health examination (if required by visa subclass)",
      ]}
      sections={[
        {
          title: "Visitor Visa - Subclass 600",
          documents: [
            "Evidence of purpose of visit (tourism, business, family)",
            "Invitation letter from Australian sponsor (if visiting family/friends)",
            "Return flight reservation or itinerary",
            "Hotel bookings or accommodation details",
            "Letter from employer confirming leave and return to work",
            "Proof of sufficient funds to cover entire visit",
            "Ties to home country (employment, property, family)",
          ],
        },
        {
          title: "Student Visa - Subclass 500",
          documents: [
            "Electronic Confirmation of Enrolment (eCoE) from Australian institution",
            "Genuine Student requirement evidence (statement of purpose)",
            "Overseas Student Health Cover (OSHC) for full study period",
            "English proficiency test results (IELTS, PTE, TOEFL, or Cambridge)",
            "Academic transcripts and qualification certificates",
            "Financial capacity evidence: AUD $29,710/year for living costs + tuition fees",
            "Skills assessment (if required for the course)",
          ],
        },
        {
          title: "Skilled Independent Visa - Subclass 189",
          documents: [
            "Expression of Interest (EOI) through SkillSelect",
            "Skills assessment from the relevant assessing authority",
            "English language test results (IELTS, PTE, TOEFL, or OET)",
            "Employment reference letters (last 10 years, detailed)",
            "Qualification certificates and academic transcripts",
            "Health examination results",
            "Police clearance certificates (all countries lived in for 12+ months)",
          ],
        },
        {
          title: "Character and health requirements",
          documents: [
            "Police clearance certificate from home country",
            "Police clearances from all countries of residence (12+ months)",
            "Medical examination by a panel physician (if required)",
            "Chest X-ray results (if required)",
            "Declaration of health on application form",
          ],
        },
      ]}
      faqItems={[
        {
          question: "How much money do I need for an Australian visitor visa?",
          answer: "There is no fixed amount, but you need to show enough money to cover the trip without working illegally. For a typical 1 to 3 month visit, AUD $5,000 to $10,000 is often enough, along with proof of steady income back home.",
        },
        {
          question: "What is an eCoE and how do I get one?",
          answer: "An Electronic Confirmation of Enrolment (eCoE) is issued by your Australian education provider after you accept your offer and pay any required deposit. You cannot submit a student visa application without it.",
        },
        {
          question: "How long does Australian visitor visa processing take?",
          answer: "Most visitor visa applications are processed within 1 to 4 weeks, though it depends on your nationality and how complete the application is. Health or character checks can add time, so it is worth applying early.",
        },
        {
          question: "Do I need Overseas Student Health Cover before applying for a student visa?",
          answer: "Yes. OSHC is a mandatory condition of the student visa. You need coverage from an approved provider for the full length of your visa, and you have to show proof with the application.",
        },
      ]}
      currentVisa="australia"
      lastReviewedAt={PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}
      officialSources={[
        {
          label: "Visitor visa subclass 600",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600",
        },
        {
          label: "Student visa subclass 500",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
        },
        {
          label: "Skilled Independent visa subclass 189",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-independent-189",
        },
      ]}
      schemaName="Australia Visa Document Requirements Checklist"
      schemaDescription="Document checklist for Australia Visitor (subclass 600), Student (subclass 500), and Skilled visa applications."
      schemaItems={[
        "Valid passport",
        "Online ImmiAccount application",
        "Passport photos",
        "Bank statements",
        "Health examination (if required)",
        "Police clearance certificate",
        "Application fee payment",
        "Health insurance or OSHC",
      ]}
    />
  )
}
