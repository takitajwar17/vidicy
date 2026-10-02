"use client"

import { usePathname } from "next/navigation"
import { useTopLoader } from "nextjs-toploader"
import { useEffect, useRef } from "react"
import { useSessionStore } from "@/state/session"

export function RouteProgressProvider() {
  const { done } = useTopLoader()
  const pathname = usePathname()
  const fetchSession = useSessionStore((store) => store.fetchSession)
  const fetchSessionRef = useRef(fetchSession)

  useEffect(() => {
    fetchSessionRef.current = fetchSession
  }, [fetchSession])

  useEffect(() => {
    fetchSessionRef.current?.()
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
