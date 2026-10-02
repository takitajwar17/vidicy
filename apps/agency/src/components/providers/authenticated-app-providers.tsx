"use client"

import { Suspense } from "react"
import type { ReactNode } from "react"
import type { getConfig } from "@/flags"
import type { SessionValidationResult } from "@/types"
import { EmailVerificationDialog } from "../email-verification-dialog"
import { RouteProgressProvider } from "./route-progress-provider"
import { SessionRefreshProvider } from "./session-refresh-provider"

interface AuthenticatedAppProvidersProps {
  children: ReactNode
  config?: Awaited<ReturnType<typeof getConfig>> | null
  session: SessionValidationResult
}

export function AuthenticatedAppProviders({
  children,
  config = null,
  session,
}: AuthenticatedAppProvidersProps) {
  return (
    <>
      <SessionRefreshProvider initialConfig={config} initialSession={session} />
      <Suspense>
        <RouteProgressProvider />
      </Suspense>
      {children}
      <EmailVerificationDialog />
    </>
  )
}
