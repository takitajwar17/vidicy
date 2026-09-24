import { describe, it, expect } from 'vitest'
import {
  CANONICAL_SITE_DOMAIN,
  CANONICAL_SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
  SITE_DOMAIN,
  PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS,
  EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS,
  MAX_SESSIONS_PER_USER,
  SESSION_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME,
  REDIRECT_AFTER_SIGN_IN,
} from '@/constants'

describe('Application Constants Consistency', () => {
  // ============================
  // Site Configuration
  // ============================
  describe('Site Configuration', () => {
    it('should have a non-empty site name', () => {
      expect(SITE_NAME).toBeTruthy()
      expect(typeof SITE_NAME).toBe('string')
      expect(SITE_NAME.length).toBeGreaterThan(0)
    })

    it('should have a non-empty site description', () => {
      expect(SITE_DESCRIPTION).toBeTruthy()
      expect(typeof SITE_DESCRIPTION).toBe('string')
    })

    it('should have a valid site URL', () => {
      expect(SITE_URL).toBeTruthy()
      expect(() => new URL(SITE_URL)).not.toThrow()
    })

    it('should have a fixed canonical site URL', () => {
      expect(CANONICAL_SITE_URL).toBe('https://agency.vidicy.com')
      expect(CANONICAL_SITE_DOMAIN).toBe('agency.vidicy.com')
      expect(new URL(CANONICAL_SITE_URL).hostname).toBe(CANONICAL_SITE_DOMAIN)
    })

    it('should have a valid site domain derived from SITE_URL', () => {
      expect(SITE_DOMAIN).toBeTruthy()
      const derivedDomain = new URL(SITE_URL).hostname
      expect(SITE_DOMAIN).toBe(derivedDomain)
    })
  })

  // ============================
  // Authentication Constants
  // ============================
  describe('Authentication Constants', () => {
    it('should have positive session limits', () => {
      expect(MAX_SESSIONS_PER_USER).toBeGreaterThan(0)
      expect(MAX_SESSIONS_PER_USER).toBe(5)
    })

    it('should have a valid session cookie name', () => {
      expect(SESSION_COOKIE_NAME).toBeTruthy()
      expect(SESSION_COOKIE_NAME).toBe('session')
    })

    it('should have valid OAuth cookie names', () => {
      expect(GOOGLE_OAUTH_STATE_COOKIE_NAME).toBeTruthy()
      expect(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME).toBeTruthy()
    })

    it('should have valid redirect path after sign in', () => {
      expect(REDIRECT_AFTER_SIGN_IN).toBeTruthy()
      expect(REDIRECT_AFTER_SIGN_IN).toMatch(/^\//)
    })
  })

  // ============================
  // Token Expiration
  // ============================
  describe('Token Expiration Constants', () => {
    it('should have positive password reset token expiration', () => {
      expect(PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS).toBeGreaterThan(0)
    })

    it('should have password reset token expire in 24 hours', () => {
      expect(PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS).toBe(24 * 60 * 60)
    })

    it('should have positive email verification token expiration', () => {
      expect(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS).toBeGreaterThan(0)
    })

    it('should have email verification token expire in 24 hours', () => {
      expect(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS).toBe(24 * 60 * 60)
    })

    it('should have consistent token expiration durations', () => {
      // Password reset and email verification should have equal expiration
      expect(PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS).toBe(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS)
    })
  })

})
