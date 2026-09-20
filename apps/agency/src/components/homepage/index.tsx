import Footer from "@/components/sections/footer";
import Header from "@/components/sections/header";
import {
  ProgressiveBackgroundVideo,
  ensureBackgroundVideoPlayback,
  shouldUpgradeBackgroundVideo,
} from "@/components/homepage/background-video";
import type { HomepageConfig } from "@/components/homepage/config";
import { pageTheme } from "@/components/homepage/section-primitives";
import {
  FaqSection,
  HeroSection,
  HowItWorksSection,
  PricingSection,
  ProblemSection,
} from "@/components/homepage/sections";
import { DestinationsStrip } from "@/components/homepage/server-sections";
import { LandingSignupPopup } from "@/components/homepage/hero-client";
import Testimonials from "@/components/sections/testimonials";

const backgroundVideoColorTintClassName = [
  "absolute inset-0 bg-primary/10 mix-blend-soft-light",
  "md:bg-[linear-gradient(120deg,rgba(76,110,255,0.12)_0%,rgba(255,255,255,0.01)_42%,rgba(90,198,255,0.16)_100%)]",
  "md:mix-blend-screen",
  "lg:bg-[linear-gradient(120deg,rgba(76,110,255,0.18)_0%,rgba(255,255,255,0.01)_42%,rgba(90,198,255,0.24)_100%)]",
].join(" ");

const backgroundVideoEdgeTintClassName = [
  "absolute inset-0 hidden md:block mix-blend-multiply",
  "bg-[linear-gradient(90deg,rgba(116,200,255,0.18)_0%,rgba(255,255,255,0)_24%,rgba(255,255,255,0)_76%,rgba(116,200,255,0.18)_100%)]",
  "lg:bg-[linear-gradient(90deg,rgba(116,200,255,0.3)_0%,rgba(255,255,255,0)_24%,rgba(255,255,255,0)_76%,rgba(116,200,255,0.3)_100%)]",
].join(" ");

export function HomepageLanding({
  config,
  includeSiteChrome = true,
}: {
  config: HomepageConfig;
  includeSiteChrome?: boolean;
}) {
  return (
    <div
      style={pageTheme}
      className="relative isolate overflow-x-clip text-foreground font-body [font-family:var(--font-body)]"
    >
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <ProgressiveBackgroundVideo />
        <div className={backgroundVideoColorTintClassName} />
        <div className={backgroundVideoEdgeTintClassName} />
      </div>

      {includeSiteChrome ? <Header /> : null}
      <LandingSignupPopup />
      <HeroSection config={config} sectionId={includeSiteChrome ? "main-content" : undefined} />
      <DestinationsStrip />
      <ProblemSection />
      <HowItWorksSection />
      <Testimonials />
      <PricingSection />
      <FaqSection />
      {includeSiteChrome ? <Footer className="mt-10" /> : null}
    </div>
  );
}

export { ensureBackgroundVideoPlayback, shouldUpgradeBackgroundVideo };
