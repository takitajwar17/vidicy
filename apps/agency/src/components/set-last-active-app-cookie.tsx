"use client"

import { useEffect } from "react"
import { COOKIE_MAX_AGE_30_DAYS } from "@/constants"

/**
 * Sets the lastActiveApp cookie client-side whenever the workspace changes.
 * This is a preference cookie (non-sensitive) so it can be written via document.cookie.
 */
export function SetLastActiveAppCookie({ appId }: { appId: string }) {
  useEffect(() => {
    const maxAge = COOKIE_MAX_AGE_30_DAYS
    document.cookie = `lastActiveApp=${appId}; path=/; max-age=${maxAge}; samesite=lax`
  }, [appId])

  return null
}
