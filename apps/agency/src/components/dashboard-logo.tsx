"use client";

import type { ComponentProps } from "react";
import Logo from "@/components/logo";

type DashboardLogoProps = Omit<ComponentProps<typeof Logo>, "variant">;

export default function DashboardLogo(props: DashboardLogoProps) {
  return <Logo variant="horizontal" surface="dark" {...props} />;
}
