import {
  getProblemGuide,
  getProblemGuideImage,
} from "@/app/(marketing)/_content/problem-guides";
import { ProblemGuidePage } from "@/app/(marketing)/_components/problem-guide-page";
import { constructMetadata } from "@/lib/utils";

const guide = getProblemGuide("proof-of-funds-for-visa-application");

export const metadata = constructMetadata({
  title: guide.title,
  description: guide.description,
  image: getProblemGuideImage(guide),
  alternates: {
    canonical: guide.href,
  },
});

export default function ProofOfFundsForVisaApplicationGuidePage() {
  return <ProblemGuidePage guide={guide} />;
}
