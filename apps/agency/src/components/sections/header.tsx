"use client";

import Drawer from "@/components/drawer";
import Logo from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { marketingTopBarLinks } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface IsActiveTopBarLinkParams {
  href: string;
  pathname: string;
  hash?: string;
}

function getHashFragment({ href }: Pick<IsActiveTopBarLinkParams, "href">) {
  const [path, hashFragment] = href.split("#");

  return {
    path: path || "/",
    hash: hashFragment ? `#${hashFragment}` : "",
  };
}

export function isActiveTopBarLink({
  href,
  pathname,
  hash = "",
}: IsActiveTopBarLinkParams): boolean {
  if (href.includes("#")) {
    const target = getHashFragment({ href });

    return pathname === target.path && hash === target.hash;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const [addBorder, setAddBorder] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const pathname = usePathname() ?? "";
  const hidePrimaryCta = pathname === "/sign-up";

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setAddBorder(true);
      } else {
        setAddBorder(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const syncCurrentHash = () => {
      setCurrentHash(window.location.hash);
    };

    syncCurrentHash();
    window.addEventListener("hashchange", syncCurrentHash);

    return () => {
      window.removeEventListener("hashchange", syncCurrentHash);
    };
  }, []);

  return (
    <>
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none"
    >
      Skip to main content
    </a>
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 h-16 sm:h-20 transition-all duration-300 ease-out",
        addBorder
          ? "bg-background/70 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)]"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        <Link
          href="/"
          title="brand-logo"
          className="relative flex items-center space-x-2 ml-4 sm:ml-8 lg:justify-self-start"
        >
          <Logo variant="mark" className="h-10 w-10 sm:h-12 sm:w-12" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex lg:justify-self-center">
          {marketingTopBarLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-4 py-2 text-sm font-medium text-foreground/72 transition-colors hover:text-foreground",
                isActiveTopBarLink({
                  href: item.href,
                  pathname,
                  hash: currentHash,
                }) && "text-foreground font-bold",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex lg:justify-self-end">
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "outline" })}
          >
            Sign in
          </Link>
          {hidePrimaryCta ? null : (
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full h-10! rounded-[6px]! border border-black/80 border-b-black/95 border-t-white/25 bg-[linear-gradient(180deg,#1a1a1a_0%,#070707_52%,#000000_100%)]! px-5 text-[#FFFFFF]! transition-[transform,background-image,border-color] duration-200 hover:bg-[linear-gradient(180deg,#202020_0%,#0d0d0d_52%,#040404_100%)]! hover:border-t-white/35 active:translate-y-[2px] sm:w-auto"
              )}
            >
              <span className="font-medium">Get My Free Review</span>
            </Link>
          )}
        </div>
        <div className="mt-1 cursor-pointer block lg:hidden">
          <Drawer hidePrimaryCta={hidePrimaryCta} />
        </div>
      </div>

    </header>
    </>
  );
}
