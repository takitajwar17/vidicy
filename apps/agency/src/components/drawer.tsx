import Logo from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_SIGN_UP_CTA_LABEL } from "@/constants";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { marketingTopBarLinks, siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { IoMenuSharp } from "react-icons/io5";
import type { ComponentType } from "react";

const MenuIcon = IoMenuSharp as unknown as ComponentType<{ className?: string }>;

export default function drawerDemo({
  hideAuthActions = false,
  hidePrimaryCta = false,
}: {
  hideAuthActions?: boolean;
  hidePrimaryCta?: boolean;
}) {
  return (
    <Drawer>
      <DrawerTrigger aria-label="Open menu">
        <MenuIcon className="text-2xl" />
      </DrawerTrigger>
      <DrawerContent className="rounded-t-[28px] border-border/70 bg-background/95 pb-2 backdrop-blur-xl">
        <DrawerHeader className="px-6 pb-3 pt-2">
          <DrawerTitle className="sr-only">Site navigation</DrawerTitle>
          <div className="rounded-[1.75rem] border border-primary/15 bg-background/70 px-4 py-4">
            <div className="flex items-center gap-3.5">
              <Link
                href="/"
                title="brand-logo"
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.2rem]"
              >
                <Logo variant="mark" className="h-10 w-10" />
              </Link>
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                  {siteConfig.name}
                </p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Request pilot access or sign in to continue your agency workflow.
                </p>
              </div>
            </div>
          </div>
        </DrawerHeader>
        <div className="px-6 pb-1">
          <nav
            aria-label="Primary"
            className="rounded-[1.75rem] border border-border/70 bg-background/80 p-2"
          >
            {marketingTopBarLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-full px-4 py-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {hideAuthActions ? null : (
          <DrawerFooter className="gap-3 px-6 pb-6 pt-1">
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 w-full rounded-full border-border/75 bg-background/95 text-base font-medium hover:bg-muted/50",
              )}
            >
              Login
            </Link>
            {hidePrimaryCta ? null : (
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "!h-12 w-full rounded-full border border-black/80 border-b-black/95 border-t-white/25 !bg-[linear-gradient(180deg,#1a1a1a_0%,#070707_52%,#000000_100%)] text-base font-semibold !text-[#FFFFFF] transition-[transform,background-image,border-color] duration-200 hover:!bg-[linear-gradient(180deg,#202020_0%,#0d0d0d_52%,#040404_100%)] hover:border-t-white/35 active:translate-y-[2px]",
                )}
              >
                {PUBLIC_SIGN_UP_CTA_LABEL}
              </Link>
            )}
            <p className="pt-1 text-center text-xs leading-5 text-muted-foreground">
              Built for agency teams reviewing client files at volume.
            </p>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
