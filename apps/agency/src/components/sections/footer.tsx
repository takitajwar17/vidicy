import Logo from "@/components/logo";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { FaXTwitter } from "react-icons/fa6";
import type { ComponentType } from "react";

const XIcon = FaXTwitter as unknown as ComponentType<{ className?: string }>;

function isExternalHref(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

interface ComplianceBadge {
  iconSrc: string;
  darkIconSrc?: string;
  iconAlt: string;
  href?: string;
  imageClassName?: string;
  width?: number;
  height?: number;
}

const complianceBadges: readonly ComplianceBadge[] = [
  {
    iconSrc: "/regulations/gdpr.1dd801e6.svg",
    iconAlt: "GDPR regulation mark",
    width: 92,
    height: 44,
  },
  {
    iconSrc: "/regulations/ccpa.f8f08126.svg",
    iconAlt: "CCPA regulation mark",
    width: 92,
    height: 44,
  },
];

const footerSections = [
  {
    title: "Pages",
    links: [
      { href: "/faq", text: "FAQ" },
      { href: "/enterprise", text: "Enterprise" },
      { href: "/about", text: "About" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: `mailto:${siteConfig.links.email}`, text: "Contact Us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", text: "Privacy Policy" },
      { href: "/terms", text: "Terms of Service" },
      { href: "/subprocessors", text: "Subprocessors" },
    ],
  },
] as const;

const socialLinks = [
  { href: siteConfig.links.twitter, label: "X", icon: XIcon },
] as const;

export default function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("dark relative mt-10 overflow-hidden border-t border-border bg-background text-foreground", className)}>
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
                className="public-footer-status inline-flex w-fit items-center gap-2.5 rounded-[1rem] bg-background/66 px-4 py-2.5 text-base font-medium tracking-tight text-foreground/78 backdrop-blur-sm"
                role="status"
              >
                <span className="public-footer-status-dot h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
                <span>All systems operational</span>
              </div>

              <div className="flex flex-wrap items-center gap-3.5 sm:gap-4">
                {complianceBadges.map((item) => {
                  const imageClassName = item.imageClassName ?? "h-11 w-auto shrink-0";
                  const badgeImage = item.darkIconSrc ? (
                    <>
                      <Image
                        src={item.iconSrc}
                        alt={item.iconAlt}
                        width={item.width ?? 92}
                        height={item.height ?? 44}
                        className={cn(imageClassName, "dark:hidden")}
                        loading="lazy"
                      />
                      <Image
                        src={item.darkIconSrc}
                        alt={item.iconAlt}
                        width={item.width ?? 92}
                        height={item.height ?? 44}
                        className={cn(imageClassName, "hidden dark:block")}
                        loading="lazy"
                      />
                    </>
                  ) : (
                    <Image
                      src={item.iconSrc}
                      alt={item.iconAlt}
                      width={item.width ?? 92}
                      height={item.height ?? 44}
                      className={imageClassName}
                      loading="lazy"
                    />
                  );

                  return (
                    <div
                      key={item.iconSrc}
                      className="public-footer-badge flex h-14 w-auto items-center justify-center px-1"
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
                <p className="text-base font-semibold tracking-tight text-foreground">
                  {section.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => {
                    const href = link.href.trim();
                    const commonClasses =
                      "public-footer-link text-base leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm";

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
