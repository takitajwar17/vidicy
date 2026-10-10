"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";

import type { ComponentProps } from "react";

export function DecorativeVideo(props: ComponentProps<"video">) {
  const reduceMotion = useMediaQuery("REDUCED_MOTION");
  return reduceMotion ? null : <video {...props} aria-hidden="true" />;
}
