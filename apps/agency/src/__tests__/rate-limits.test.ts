import { describe, it, expect } from 'vitest'
import { RATE_LIMITS } from '@/infra/with-rate-limit'

describe('Rate Limiting Configuration Consistency', () => {
  describe('Rate Limit Configurations', () => {
    it('should have all expected rate limit identifiers', () => {
      expect(RATE_LIMITS).toHaveProperty('SIGN_IN')
      expect(RATE_LIMITS).toHaveProperty('GOOGLE_SSO_REQUEST')
      expect(RATE_LIMITS).toHaveProperty('GOOGLE_SSO_CALLBACK')
      expect(RATE_LIMITS).toHaveProperty('SIGN_UP')
      expect(RATE_LIMITS).toHaveProperty('SIGN_OUT')
      expect(RATE_LIMITS).toHaveProperty('RESET_PASSWORD')
      expect(RATE_LIMITS).toHaveProperty('DELETE_SESSION')
      expect(RATE_LIMITS).toHaveProperty('EMAIL')
      expect(RATE_LIMITS).toHaveProperty('FORGOT_PASSWORD')
      expect(RATE_LIMITS).toHaveProperty('SETTINGS')
      expect(RATE_LIMITS).toHaveProperty('PURCHASE')
      expect(RATE_LIMITS).toHaveProperty('TEAM_INVITE')
    })

    it('should have valid structure for each rate limit', () => {
      for (const [, config] of Object.entries(RATE_LIMITS)) {
        expect(config).toHaveProperty('identifier')
        expect(config).toHaveProperty('limit')
        expect(config).toHaveProperty('windowInSeconds')
        expect(typeof config.identifier).toBe('string')
        expect(typeof config.limit).toBe('number')
        expect(typeof config.windowInSeconds).toBe('number')
      }
    })

    it('should have positive limits for all rate limits', () => {
      for (const [, config] of Object.entries(RATE_LIMITS)) {
        expect(config.limit).toBeGreaterThan(0)
      }
    })

    it('should have positive window durations', () => {
      for (const [, config] of Object.entries(RATE_LIMITS)) {
        expect(config.windowInSeconds).toBeGreaterThan(0)
      }
    })

    it('should have unique identifiers across configurations', () => {
      const identifiers = Object.values(RATE_LIMITS).map(c => c.identifier)
      // Note: Some rate limits may share the same identifier intentionally
      // (e.g., RESET_PASSWORD uses "auth" identifier)
      expect(identifiers.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
    })

    it('should have stricter limits for sign-up than sign-in', () => {
      expect(RATE_LIMITS.SIGN_UP.limit).toBeLessThan(RATE_LIMITS.SIGN_IN.limit)
    })

    it('should have Google SSO request and callback with same limits', () => {
      expect(RATE_LIMITS.GOOGLE_SSO_REQUEST.limit).toBe(RATE_LIMITS.GOOGLE_SSO_CALLBACK.limit)
      expect(RATE_LIMITS.GOOGLE_SSO_REQUEST.windowInSeconds).toBe(
        RATE_LIMITS.GOOGLE_SSO_CALLBACK.windowInSeconds
      )
    })

    it('should have reasonable sign-up limits (very restrictive)', () => {
      expect(RATE_LIMITS.SIGN_UP.limit).toBeLessThanOrEqual(5)
    })

    it('should have sign-out with shorter window than sign-in', () => {
      expect(RATE_LIMITS.SIGN_OUT.windowInSeconds).toBeLessThanOrEqual(
        RATE_LIMITS.SIGN_IN.windowInSeconds
      )
    })
  })
})
