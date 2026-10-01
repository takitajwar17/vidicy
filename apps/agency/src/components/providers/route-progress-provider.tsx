"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTopLoader } from "nextjs-toploader"
import { useEffect, useRef } from "react"
import { useSessionStore } from "@/state/session"

export function RouteProgressProvider() {
  const { start, done } = useTopLoader()
  const pathname = usePathname()
  const router = useRouter()
  const fetchSession = useSessionStore((store) => store.fetchSession)
  const fetchSessionRef = useRef(fetchSession)

  useEffect(() => {
    fetchSessionRef.current = fetchSession
  }, [fetchSession])

  useEffect(() => {
    const originalPush = router.push.bind(router)
    const originalRefresh = router.refresh.bind(router)

    // Next.js does not expose route-progress hooks for App Router transitions yet.
    router.push = (href, options) => {
      start()
      originalPush(href, options)
    }

    router.refresh = () => {
      start()
      fetchSessionRef.current?.()
      originalRefresh()
    }

    return () => {
      router.push = originalPush
      router.refresh = originalRefresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
