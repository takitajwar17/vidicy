"use client"

import { useCallback, useEffect, useRef } from "react"
import { useDebounceCallback } from "usehooks-ts"
import type { getConfig } from "@/flags"
import { useConfigStore } from "@/state/config"
import { useSessionStore } from "@/state/session"
import type { SessionValidationResult } from "@/types"

export function SessionRefreshProvider() {
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
    fetchSession()
  }, [fetchSession])

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
