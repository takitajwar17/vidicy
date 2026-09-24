import { describe, expect, it } from "vitest"

import { COUNTRIES, YEAR_OPTIONS as SHARED_YEAR_OPTIONS } from "@/constants"
import { YEAR_OPTIONS as NEW_APPLICATION_YEAR_OPTIONS } from "@/app/(dashboard)/dashboard/applications/new/new-application-constants"

describe("dropdown options consistency", () => {
  it("keeps year dropdown options shared between global constants and new application flow", () => {
    expect(NEW_APPLICATION_YEAR_OPTIONS).toEqual(SHARED_YEAR_OPTIONS)
  })

  it("keeps year dropdown options at least 50 years deep", () => {
    const currentYear = new Date().getFullYear()
    const oldestRequiredYear = String(currentYear - 49)

    expect(SHARED_YEAR_OPTIONS.length).toBeGreaterThanOrEqual(50)
    expect(SHARED_YEAR_OPTIONS[0]).toBe(String(currentYear))
    expect(SHARED_YEAR_OPTIONS).toContain(oldestRequiredYear)
  })

  it("keeps country list large enough for global selector use", () => {
    expect(COUNTRIES.length).toBeGreaterThan(100)
  })
})
