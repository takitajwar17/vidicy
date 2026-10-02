import type { ComponentPropsWithoutRef } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGO_VARIANTS = {
  horizontal: {
    light: "/logo/light/transparent_logo_text_horizontal_nobuffer.png",
    dark: "/logo/dark/transparent_logo_text_horizontal_nobuffer.png",
    width: 320,
    height: 92,
  },
  vertical: {
    light: "/logo/light/transparent_logo_text_vertical_nobuffer.png",
    dark: "/logo/dark/transparent_logo_text_vertical_nobuffer.png",
    width: 220,
    height: 220,
  },
  mark: {
    light: "/logo/light/transparent_logo_nobuffer.png",
    dark: "/logo/dark/transparent_logo_nobuffer.png",
    width: 160,
    height: 160,
  },
} as const;

interface LogoProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  alt?: string;
  className?: string;
  surface?: "auto" | "light" | "dark";
  variant?: keyof typeof LOGO_VARIANTS;
}

export default function Logo({
  alt = "Vidicy",
  className,
  surface = "auto",
  variant = "horizontal",
  ...props
}: LogoProps) {
  const sources = LOGO_VARIANTS[variant];

  if (surface === "light") {
    return (
      <span
        className="inline-flex items-center"
        {...props}
      >
        <Image
          src={sources.dark}
          alt={alt}
          width={sources.width}
          height={sources.height}
          sizes="(max-width: 640px) 140px, 180px"
          draggable="false"
          className={cn("select-none object-contain", className)}
        />
      </span>
    );
  }

  if (surface === "dark") {
    return (
      <span
        className="inline-flex items-center"
        {...props}
      >
        <Image
          src={sources.light}
          alt={alt}
          width={sources.width}
          height={sources.height}
          sizes="(max-width: 640px) 140px, 180px"
          draggable="false"
          className={cn("select-none object-contain", className)}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center"
      {...props}
    >
      <Image
        src={sources.dark}
        alt={alt}
        width={sources.width}
        height={sources.height}
        sizes="(max-width: 640px) 140px, 180px"
        draggable="false"
        className={cn("select-none object-contain dark:hidden", className)}
      />
      <Image
        src={sources.light}
        alt={alt}
        width={sources.width}
        height={sources.height}
        sizes="(max-width: 640px) 140px, 180px"
        draggable="false"
        className={cn("hidden select-none object-contain dark:block", className)}
      />
    </span>
  );
}
