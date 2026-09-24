import { describe, it, expect } from 'vitest'
import { getInitials } from '@/utils/name-initials'
import { capitalize } from '@/utils/text'
import { getResetTokenKey, getVerificationTokenKey } from '@/utils/auth-utils'

describe('Utility Functions Data Consistency', () => {
  // ============================
  // getInitials
  // ============================
  describe('getInitials', () => {
    it('should return initials from a two-part name', () => {
      expect(getInitials('John Doe')).toBe('JD')
    })

    it('should return initials from a single-part name', () => {
      expect(getInitials('John')).toBe('J')
    })

    it('should return at most 2 initials by default', () => {
      expect(getInitials('John Michael Doe')).toBe('JM')
    })

    it('should return empty string for empty input', () => {
      expect(getInitials('')).toBe('')
    })

    it('should handle names with extra whitespace', () => {
      expect(getInitials('  John   Doe  ')).toBe('JD')
    })

    it('should uppercase initials', () => {
      expect(getInitials('john doe')).toBe('JD')
    })

    it('should respect custom maxLength', () => {
      expect(getInitials('John Michael Doe', 3)).toBe('JMD')
    })

    it('should handle single character names', () => {
      expect(getInitials('J D')).toBe('JD')
    })

    it('should handle whitespace-only input', () => {
      expect(getInitials('   ')).toBe('')
    })
  })

  // ============================
  // capitalize
  // ============================
  describe('capitalize', () => {
    it('should capitalize the first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
    })

    it('should handle already capitalized strings', () => {
      expect(capitalize('Hello')).toBe('Hello')
    })

    it('should handle single character', () => {
      expect(capitalize('h')).toBe('H')
    })

    it('should return empty string for empty input', () => {
      expect(capitalize('')).toBe('')
    })

    it('should handle uppercase strings', () => {
      expect(capitalize('HELLO')).toBe('HELLO')
    })

    it('should only capitalize the first character', () => {
      expect(capitalize('hello world')).toBe('Hello world')
    })
  })

  // ============================
  // Auth Token Keys
  // ============================
  describe('Auth Token Key Generation', () => {
    it('should generate consistent reset token keys', () => {
      const token = 'test-token-123'
      expect(getResetTokenKey(token)).toBe(`password-reset:${token}`)
    })

    it('should generate consistent verification token keys', () => {
      const token = 'test-token-456'
      expect(getVerificationTokenKey(token)).toBe(`email-verification:${token}`)
    })

    it('should produce different key formats for different token types', () => {
      const token = 'same-token'
      expect(getResetTokenKey(token)).not.toBe(getVerificationTokenKey(token))
    })

    it('should use different prefixes', () => {
      const token = 'test-token'
      expect(getResetTokenKey(token)).toMatch(/^password-reset:/)
      expect(getVerificationTokenKey(token)).toMatch(/^email-verification:/)
    })

    it('should handle empty tokens', () => {
      expect(getResetTokenKey('')).toBe('password-reset:')
      expect(getVerificationTokenKey('')).toBe('email-verification:')
    })
  })
})
