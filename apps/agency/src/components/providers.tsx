"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { HeroUIProvider } from "@heroui/react"
import { Suspense } from "react"
import type { ComponentProps, ComponentType, ReactNode } from "react"
import { EmailVerificationDialog } from "./email-verification-dialog"
import { RouteProgressProvider } from "./providers/route-progress-provider"
import { SessionRefreshProvider } from "./providers/session-refresh-provider"

type NextThemesProviderProps = Omit<ComponentProps<typeof NextThemesProvider>, "children"> & {
  children: ReactNode
}

const TypedNextThemesProvider = NextThemesProvider as unknown as ComponentType<NextThemesProviderProps>

export function ThemeProvider({
  children,
  ...props
}: NextThemesProviderProps) {
  return (
    <HeroUIProvider>
      <SessionRefreshProvider />
      <Suspense>
        <RouteProgressProvider />
      </Suspense>
      <TypedNextThemesProvider {...props} attribute="class">
        {children}
        <EmailVerificationDialog />
      </TypedNextThemesProvider>
    </HeroUIProvider>
  )
}
