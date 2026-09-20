"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { HeroUIProvider } from "@heroui/react"
import type { SessionValidationResult } from "@/types"
import { useSessionStore } from "@/state/session"
import { Suspense, useEffect, useRef, RefObject, useCallback } from "react"
import { useConfigStore } from "@/state/config"
import type { getConfig } from "@/flags"
import { EmailVerificationDialog } from "./email-verification-dialog"
import { useTopLoader } from 'nextjs-toploader'
import { usePathname, useRouter } from "next/navigation"
import { useEventListener, useDebounceCallback } from 'usehooks-ts';

function RouterChecker() {
  const { start, done } = useTopLoader()
  const pathname = usePathname();
  const router = useRouter();
  const fetchSession = useSessionStore((store) => store.fetchSession)
  const fetchSessionRef = useRef(fetchSession)

  // Keep ref in sync whenever fetchSession changes (including when ThemeProvider sets it)
  useEffect(() => {
    fetchSessionRef.current = fetchSession
  }, [fetchSession])

  useEffect(() => {
    const _push = router.push.bind(router);
    const _refresh = router.refresh.bind(router);

    // Monkey patch: https://github.com/vercel/next.js/discussions/42016#discussioncomment-9027313
    router.push = (href, options) => {
      start();
      _push(href, options);
    };

    // Monkey patch: https://github.com/vercel/next.js/discussions/42016#discussioncomment-9027313
    router.refresh = () => {
      start();
      fetchSessionRef.current?.();
      _refresh();
    };
    return () => {
      router.push = _push
      router.refresh = _refresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    done();
    // Only complete the route-progress indicator on pathname transitions.
    // Session refreshes happen on initial mount, focus/visibility, and explicit router.refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const setSession = useSessionStore((store) => store.setSession)
  const setConfig = useConfigStore((store) => store.setConfig)
  const refetchSession = useSessionStore((store) => store.refetchSession)
  const clearSession = useSessionStore((store) => store.clearSession)
  const documentRef = useRef(typeof window === 'undefined' ? null : document)
  const windowRef = useRef(typeof window === 'undefined' ? null : window)

  const doFetchSession = useCallback(async () => {
    try {
      refetchSession() // Set loading state before fetch
      const response = await fetch('/api/get-session')
      const sessionWithConfig = await response.json() as {
        session: SessionValidationResult
        config: Awaited<ReturnType<typeof getConfig>>
      }

      setConfig(sessionWithConfig?.config)

      if (sessionWithConfig?.session) {
        setSession(sessionWithConfig?.session)
      } else {
        clearSession()
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
      clearSession()
    }
  }, [setSession, setConfig, clearSession, refetchSession])

  // Keep a ref to the latest doFetchSession so the debounced callback never goes stale
  const doFetchSessionRef = useRef(doFetchSession)
  useEffect(() => { doFetchSessionRef.current = doFetchSession })
  const fetchSession = useDebounceCallback(
    useCallback(() => doFetchSessionRef.current(), []),
    30
  )

  // Initial fetch on mount
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Handle refetches
  useEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSession()
    }
  }, documentRef as RefObject<Document>)

  useEventListener('focus', () => {
    fetchSession()
    // @ts-expect-error window is not defined in the server
  }, windowRef)

  // Add fetchSession to the session store (wrap debounced version to match store type)
  useEffect(() => {
    useSessionStore.setState({ fetchSession: async () => { fetchSession() } })
  }, [fetchSession])

  return (
    <HeroUIProvider>
      <Suspense>
        <RouterChecker />
      </Suspense>
      <NextThemesProvider {...props} attribute="class">
        {children}
        <EmailVerificationDialog />
      </NextThemesProvider>
    </HeroUIProvider>
  )
}
