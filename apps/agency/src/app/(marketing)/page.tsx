import { homepageConfig } from "@/components/homepage/config";
import { HomepageLanding } from "@/components/homepage";
import { renderHomepage } from "@/components/homepage/render-page";
import { SITE_DESCRIPTION } from "@/constants";
import { constructMetadata } from "@/lib/utils";

const homepageMetadata = constructMetadata({
  title: homepageConfig.seoTitle,
  description: homepageConfig.seoDescription ?? SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
});

export const metadata = homepageMetadata;

export default function Home() {
  return renderHomepage({ config: homepageConfig, Renderer: HomepageLanding });
}
