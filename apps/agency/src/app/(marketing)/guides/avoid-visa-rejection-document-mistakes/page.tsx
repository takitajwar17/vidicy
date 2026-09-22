import {
  getProblemGuide,
  getProblemGuideImage,
} from "@/app/(marketing)/_content/problem-guides";
import { ProblemGuidePage } from "@/app/(marketing)/_components/problem-guide-page";
import { constructMetadata } from "@/lib/utils";

const guide = getProblemGuide("avoid-visa-rejection-document-mistakes");

export const metadata = constructMetadata({
  title: guide.title,
  description: guide.description,
  image: getProblemGuideImage(guide),
  alternates: {
    canonical: guide.href,
  },
});

export default function AvoidVisaRejectionDocumentMistakesGuidePage() {
  return <ProblemGuidePage guide={guide} />;
}
