import { describe, it, expect } from 'vitest'
import { signUpSchema } from '@/schemas/signup.schema'
import { signInSchema } from '@/schemas/signin.schema'
import { userSettingsSchema } from '@/schemas/settings.schema'
import { resetPasswordSchema } from '@/schemas/reset-password.schema'
import { forgotPasswordSchema } from '@/schemas/forgot-password.schema'
import { verifyEmailSchema } from '@/schemas/verify-email.schema'
import { googleSSOCallbackSchema } from '@/schemas/google-sso-callback.schema'

describe('Schema Validation Consistency', () => {
  // ============================
  // Sign Up Schema
  // ============================
  describe('signUpSchema', () => {
    it('should accept valid signup data', () => {
      const validData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      }
      const result = signUpSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = signUpSchema.safeParse({
        email: 'not-an-email',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty email', () => {
      const result = signUpSchema.safeParse({
        email: '',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should reject firstName shorter than 2 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'J',
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should reject lastName shorter than 2 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should reject firstName longer than 255 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'A'.repeat(256),
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should reject lastName longer than 255 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D'.repeat(256),
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should accept firstName exactly 2 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'Jo',
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(true)
    })

    it('should accept firstName exactly 255 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'A'.repeat(255),
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(true)
    })

    it('should reject password shorter than 8 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'pass123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })

    it('should accept password exactly 8 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'pass1234',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(true)
    })

    it('should have consistent password min length with signIn schema', () => {
      // Both schemas enforce min 8 chars for password
      const shortPassword = 'pass123' // 7 chars

      const signUpResult = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: shortPassword,
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })

      const signInResult = signInSchema.safeParse({
        email: 'test@example.com',
        password: shortPassword,
      })

      expect(signUpResult.success).toBe(false)
      expect(signInResult.success).toBe(false)
    })
  })

  // ============================
  // Sign In Schema
  // ============================
  describe('signInSchema', () => {
    it('should accept valid signin data without csrfToken', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid signin data with csrfToken', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        csrfToken: 'some-random-token-123',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = signInSchema.safeParse({
        email: 'not-email',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing fields', () => {
      const result = signInSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  // ============================
  // Settings Schema
  // ============================
  describe('userSettingsSchema', () => {
    it('should accept valid settings data', () => {
      const result = userSettingsSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
      })
      expect(result.success).toBe(true)
    })

    it('should reject firstName shorter than 2 characters', () => {
      const result = userSettingsSchema.safeParse({
        firstName: 'J',
        lastName: 'Doe',
      })
      expect(result.success).toBe(false)
    })

    it('should reject lastName shorter than 2 characters', () => {
      const result = userSettingsSchema.safeParse({
        firstName: 'John',
        lastName: 'D',
      })
      expect(result.success).toBe(false)
    })

    it('should reject firstName longer than 255 characters', () => {
      const result = userSettingsSchema.safeParse({
        firstName: 'A'.repeat(256),
        lastName: 'Doe',
      })
      expect(result.success).toBe(false)
    })

    it('should reject lastName longer than 255 characters', () => {
      const result = userSettingsSchema.safeParse({
        firstName: 'John',
        lastName: 'A'.repeat(256),
      })
      expect(result.success).toBe(false)
    })

    it('should have consistent firstName min length with signup schema', () => {
      // Settings requires min 2, signup also requires min 2
      const twoCharName = 'Jo'
      const settingsResult = userSettingsSchema.safeParse({
        firstName: twoCharName,
        lastName: 'Doe',
      })
      const signUpResult = signUpSchema.safeParse({
        email: 'test@example.com',
        firstName: twoCharName,
        lastName: 'Doe',
        password: 'password123',
        agreeToTerms: true,
        captchaToken: 'mock-captcha-token',
      })
      expect(settingsResult.success).toBe(true)
      expect(signUpResult.success).toBe(true)
    })
  })

  // ============================
  // Reset Password Schema
  // ============================
  describe('resetPasswordSchema', () => {
    it('should accept valid reset data', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token-123',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty token', () => {
      const result = resetPasswordSchema.safeParse({
        token: '',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject token longer than 128 chars', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'a'.repeat(129),
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token',
        password: 'short',
        confirmPassword: 'short',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mismatched passwords', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token',
        password: 'password123',
        confirmPassword: 'different456',
      })
      expect(result.success).toBe(false)
    })

    it('should have consistent password min length with signup/signin', () => {
      const shortPassword = 'pass123' // 7 chars
      const resetResult = resetPasswordSchema.safeParse({
        token: 'valid-token',
        password: shortPassword,
        confirmPassword: shortPassword,
      })
      const signInResult = signInSchema.safeParse({
        email: 'test@example.com',
        password: shortPassword,
      })
      // Both should reject passwords shorter than 8 chars
      expect(resetResult.success).toBe(false)
      expect(signInResult.success).toBe(false)
    })
  })

  // ============================
  // Forgot Password Schema
  // ============================
  describe('forgotPasswordSchema', () => {
    it('should accept valid forgot password data', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'test@example.com',
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'not-email',
        captchaToken: 'mock-captcha-token',
      })
      expect(result.success).toBe(false)
    })
  })

  // ============================
  // Verify Email Schema
  // ============================
  describe('verifyEmailSchema', () => {
    it('should accept valid token', () => {
      const result = verifyEmailSchema.safeParse({
        token: 'valid-token-123',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty token', () => {
      const result = verifyEmailSchema.safeParse({
        token: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject token longer than 128 chars', () => {
      const result = verifyEmailSchema.safeParse({
        token: 'a'.repeat(129),
      })
      expect(result.success).toBe(false)
    })

  })

  // ============================
  // Google SSO Callback Schema
  // ============================
  describe('googleSSOCallbackSchema', () => {
    it('should accept valid callback data', () => {
      const result = googleSSOCallbackSchema.safeParse({
        code: 'auth-code-123',
        state: 'state-value',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty code', () => {
      const result = googleSSOCallbackSchema.safeParse({
        code: '',
        state: 'state-value',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty state', () => {
      const result = googleSSOCallbackSchema.safeParse({
        code: 'auth-code',
        state: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing fields', () => {
      const result = googleSSOCallbackSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})
