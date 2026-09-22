import type { Metadata } from "next"

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell"
import { constructMetadata } from "@/lib/utils"

const PITCH_DECK_PDF_PATH = "/vidicy_pitch_deck.pdf"

export const metadata: Metadata = constructMetadata({
  title: "Vidicy Pitch Deck",
  description:
    "View the Vidicy pitch deck for an overview of the AI visa document review platform.",
  alternates: {
    canonical: "/pitch-deck",
  },
})

export default function PitchDeckPage() {
  return (
    <PublicPage>
      <PublicPageHero
        eyebrow="Pitch Deck"
        title="Vidicy Pitch Deck"
        description="View the latest Vidicy pitch deck directly in your browser."
      />

      <PublicPageContent maxWidthClassName="max-w-6xl" className="space-y-6">
        <section aria-label="Vidicy pitch deck PDF viewer">
          <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <iframe
              src={`${PITCH_DECK_PDF_PATH}#toolbar=1&navpanes=0`}
              title="Vidicy pitch deck PDF"
              className="h-[78vh] min-h-[620px] w-full bg-muted"
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            If the deck does not load inline,{" "}
            <a
              href={PITCH_DECK_PDF_PATH}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              open the PDF
            </a>
            .
          </p>
        </section>
      </PublicPageContent>
    </PublicPage>
  )
}
