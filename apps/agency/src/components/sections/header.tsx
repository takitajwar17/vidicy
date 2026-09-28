"use client";

import Logo from "@/components/logo";
import { marketingTopBarLinks } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Route } from "next";
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
        "fixed top-0 inset-x-0 z-50 h-16 bg-[#f3f4f2]/90 text-gray-900 backdrop-blur-xl transition-all duration-300 ease-out sm:h-20",
        addBorder
          ? "border-b border-gray-950/10 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6 md:px-12 lg:px-20">
        <Link
          href="/"
          aria-label="Vidicy Agency home"
          className="flex items-center text-gray-900"
        >
          <Logo
            alt="Vidicy"
            className="h-5 w-auto sm:h-7"
            surface="light"
            variant="horizontal"
          />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {marketingTopBarLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={cn(
                "text-sm font-semibold text-gray-700 transition-colors hover:text-gray-950",
                isActiveTopBarLink({
                  href: item.href,
                  pathname,
                  hash: currentHash,
                }) && "font-bold text-gray-950",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            className="px-1 text-sm font-semibold text-gray-800 transition-colors hover:text-gray-950 sm:px-2"
            href="/sign-in"
          >
            Log in
          </Link>
          {hidePrimaryCta ? null : (
            <Link
              className="rounded-2xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition-colors hover:bg-gray-950 sm:px-4 sm:py-2.5"
              href="/sign-up"
            >
              Sign up
            </Link>
          )}
        </div>
      </div>

    </header>
    </>
  );
}
