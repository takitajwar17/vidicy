"use client"

import { useCallback, useEffect, useRef } from "react"
import { useDebounceCallback } from "usehooks-ts"
import type { getConfig } from "@/flags"
import { useConfigStore } from "@/state/config"
import { useSessionStore } from "@/state/session"
import type { SessionValidationResult } from "@/types"

interface SessionRefreshProviderProps {
  initialConfig?: Awaited<ReturnType<typeof getConfig>> | null
  initialSession?: SessionValidationResult
}

export function SessionRefreshProvider({
  initialConfig = null,
  initialSession = null,
}: SessionRefreshProviderProps) {
  const setSession = useSessionStore((store) => store.setSession)
  const setConfig = useConfigStore((store) => store.setConfig)
  const refetchSession = useSessionStore((store) => store.refetchSession)
  const clearSession = useSessionStore((store) => store.clearSession)

  const doFetchSession = useCallback(async () => {
    try {
      refetchSession()

      const response = await fetch("/api/get-session")
      const sessionWithConfig = (await response.json()) as {
        session: SessionValidationResult
        config: Awaited<ReturnType<typeof getConfig>>
      }

      setConfig(sessionWithConfig?.config)

      if (sessionWithConfig?.session) {
        setSession(sessionWithConfig.session)
      } else {
        clearSession()
      }
    } catch (error) {
      console.error("Failed to fetch session:", error)
      clearSession()
    }
  }, [clearSession, refetchSession, setConfig, setSession])

  const doFetchSessionRef = useRef(doFetchSession)

  useEffect(() => {
    doFetchSessionRef.current = doFetchSession
  })

  const fetchSession = useDebounceCallback(
    useCallback(() => doFetchSessionRef.current(), []),
    30,
  )

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig)
    }

    if (initialSession) {
      setSession(initialSession)
    } else {
      clearSession()
    }
  }, [clearSession, initialConfig, initialSession, setConfig, setSession])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        fetchSession()
      }
    }

    function handleFocus() {
      fetchSession()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [fetchSession])

  useEffect(() => {
    useSessionStore.setState({
      fetchSession: async () => {
        fetchSession()
      },
    })
  }, [fetchSession])

  return null
}
