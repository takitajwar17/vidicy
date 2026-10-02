"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ComponentProps, ComponentType, ReactNode } from "react"

type NextThemesProviderProps = Omit<ComponentProps<typeof NextThemesProvider>, "children"> & {
  children: ReactNode
}

const TypedNextThemesProvider = NextThemesProvider as unknown as ComponentType<NextThemesProviderProps>

export function ThemeProvider({
  children,
  ...props
}: NextThemesProviderProps) {
  return (
    <TypedNextThemesProvider {...props} attribute="class">
      {children}
    </TypedNextThemesProvider>
  )
}
