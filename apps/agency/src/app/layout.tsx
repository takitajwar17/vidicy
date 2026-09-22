import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "server-only";

import { ThemeProvider } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NextTopLoader from "nextjs-toploader";
import { CANONICAL_SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { siteFaviconIcons } from "@/lib/site-icons";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(CANONICAL_SITE_URL),
  keywords: [
    "Vidicy",
    "Visa Application",
    "Visa Rejection",
    "Document Review",
    "AI Visa Assistant",
    "Schengen Visa",
    "US Visa",
    "UK Visa",
    "Canada Visa",
  ],
  authors: [{ name: "Anian", url: "https://twitter.com/takitajwar17" }],
  creator: "@takitajwar17",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    images: [{ url: "/og", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    // Route-relative canonical makes every page self-canonical by default.
    canonical: "./",
  },
  icons: siteFaviconIcons,
};

export default function BaseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${manrope.variable}`}
    >
      <body
        suppressHydrationWarning
        className="font-sans antialiased text-foreground bg-background"
      >
        <NextTopLoader
          initialPosition={0.15}
          shadow="0 0 10px hsl(var(--foreground)/0.4), 0 0 5px hsl(var(--foreground)/0.4)"
          height={4}
          showSpinner={false}
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TooltipProvider delayDuration={100} skipDelayDuration={50}>
            {children}
          </TooltipProvider>
        </ThemeProvider>
        <Toaster closeButton position="top-right" expand duration={7000} />
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="oZe+17dcsEEpe8y02wK7mA"
          strategy="lazyOnload"
        />
        <Script
          src="https://aromatic-caribou-889.convex.site/api/a/am_rLALT9FXrq74hEOQ"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
