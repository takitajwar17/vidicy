import Link from "next/link";

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { buttonVariants } from "@/components/ui/button";
import { constructMetadata } from "@/lib/utils";

export const metadata = constructMetadata({
  title: "Vidicy agency pilots are invite-only",
  description:
    "Vidicy is currently onboarding selected visa and travel agency teams through private pilots.",
  alternates: {
    canonical: "/pilot-access",
  },
});

export default function PilotAccessPage() {
  return (
    <PublicPage>
      <PublicPageHero
        eyebrow="Private pilot"
        title="Vidicy agency access is currently invite-only."
      />
      <PublicPageContent className="space-y-10">
        <section className="max-w-3xl space-y-6 text-base leading-8 text-muted-foreground sm:text-lg">
          <p>
            We are working directly with selected visa and travel agency teams before opening the
            full self-serve product.
          </p>
          <p>
            The pilot is for teams that already review client files in volume and need a cleaner way
            to handle intake, review queues, issue tracking, and client-ready follow-ups.
          </p>
          <p>
            If your team is evaluating bulk application review, request pilot access and we will
            follow up with the next step.
          </p>
          <div className="pt-4">
            <Link className={buttonVariants({ size: "lg" })} href="/enterprise">
              Request pilot access
            </Link>
          </div>
        </section>
      </PublicPageContent>
    </PublicPage>
  );
}
