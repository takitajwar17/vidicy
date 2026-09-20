import Logo from "@/components/logo";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Route } from "next";
import { FaXTwitter } from "react-icons/fa6";

function isExternalHref(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

interface ComplianceBadge {
  iconSrc: string;
  darkIconSrc?: string;
  iconAlt: string;
  href?: string;
  imageClassName?: string;
}

const complianceBadges: readonly ComplianceBadge[] = [
  {
    iconSrc: "/regulations/gdpr.1dd801e6.svg",
    iconAlt: "GDPR regulation mark",
  },
  {
    iconSrc: "/regulations/ccpa.f8f08126.svg",
    iconAlt: "CCPA regulation mark",
  },
];

const footerSections = [
  {
    title: "Resources",
    links: [
      { href: "/how-it-works", text: "How It Works" },
      { href: "/#pricing", text: "Pricing" },
      { href: "/about", text: "About Us" },
    ],
  },
  {
    title: "Visa Types",
    links: [
      { href: "/visas/us", text: "US Visas" },
      { href: "/visas/schengen", text: "Schengen Visas" },
      { href: "/visas/uk", text: "UK Visas" },
      { href: "/visas/canada", text: "Canada Visas" },
      { href: "/visas/australia", text: "Australia Visas" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/faq", text: "FAQ" },
      { href: `mailto:${siteConfig.links.email}`, text: "Contact Us" },
      { href: "/enterprise", text: "Enterprise" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", text: "Privacy Policy" },
      { href: "/terms", text: "Terms of Service" },
      { href: "/terms#data-processing", text: "Data Processing" },
      { href: "/subprocessors", text: "Subprocessors" },
    ],
  },
] as const;

const socialLinks = [
  { href: siteConfig.links.twitter, label: "X", icon: FaXTwitter },
] as const;

export default function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("relative mt-16 overflow-hidden border-t border-border/70 bg-background/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] backdrop-blur-md", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--secondary)/0.62),transparent_44%),linear-gradient(180deg,hsl(var(--background)/0.96),hsl(var(--muted)/0.9))]"
      />

      <div className="relative mx-auto max-w-7xl px-5 pb-4 pt-10 sm:px-8 sm:pt-12 lg:px-12 lg:pt-14">
        <div className="grid gap-9 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-12">
          <div className="flex flex-col gap-7 lg:pr-8">
            <Link
              href="/"
              title={siteConfig.name}
              className="relative flex w-fit items-center"
            >
              <Logo variant="horizontal" className="h-10 w-auto sm:h-12" />
            </Link>

            <div className="space-y-5">
              <div
                className="inline-flex w-fit items-center gap-2.5 rounded-[1rem] bg-background/66 px-4 py-2.5 text-[1rem] font-medium tracking-tight text-foreground/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_24px_-20px_rgba(0,0,0,0.16)] backdrop-blur-sm"
                role="status"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#34c759]" aria-hidden="true" />
                <span>All systems operational</span>
              </div>

              <div className="flex flex-wrap items-center gap-3.5 sm:gap-4">
                {complianceBadges.map((item) => {
                  const imageClassName = item.imageClassName ?? "h-11 w-auto shrink-0";
                  const badgeImage = item.darkIconSrc ? (
                    <>
                      <img
                        src={item.iconSrc}
                        alt={item.iconAlt}
                        className={cn(imageClassName, "dark:hidden")}
                        loading="lazy"
                      />
                      <img
                        src={item.darkIconSrc}
                        alt={item.iconAlt}
                        className={cn(imageClassName, "hidden dark:block")}
                        loading="lazy"
                      />
                    </>
                  ) : (
                    <img
                      src={item.iconSrc}
                      alt={item.iconAlt}
                      className={imageClassName}
                      loading="lazy"
                    />
                  );

                  return (
                    <div
                      key={item.iconSrc}
                      className="flex h-14 w-auto items-center justify-center px-1 shadow-[0_10px_30px_-26px_rgba(0,0,0,0.22)]"
                    >
                      {item.href ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {badgeImage}
                        </a>
                      ) : (
                        badgeImage
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground">
                List of{" "}
                <Link href="/subprocessors" className="font-medium text-primary hover:underline">
                  subprocessors
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {footerSections.map((section) => (
              <nav key={section.title} aria-label={section.title}>
                <p className="text-[1rem] font-semibold tracking-tight text-foreground">
                  {section.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => {
                    const href = link.href.trim();
                    const commonClasses =
                      "text-[0.98rem] leading-none text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

                    return (
                      <li key={link.text}>
                        {isExternalHref(href) ? (
                          <a
                            href={href}
                            target={href.startsWith("mailto:") ? undefined : "_blank"}
                            rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                            className={commonClasses}
                          >
                            {link.text}
                          </a>
                        ) : (
                          <Link href={href as Route} className={commonClasses}>
                            {link.text}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 border-t border-border/75 pt-5 md:grid-cols-2 md:items-center">
          <p className="text-sm leading-relaxed text-foreground/66">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>

          <ul className="flex items-center justify-start gap-5 text-foreground md:justify-end">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-foreground transition-colors hover:text-primary"
                >
                  <Icon className="h-6 w-6" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
