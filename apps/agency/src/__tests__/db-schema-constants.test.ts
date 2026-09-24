import { getTableName } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import {
  ROLES_ENUM,
  MARKETING_SEQUENCE,
  MARKETING_ENROLLMENT_STATUS,
  MARKETING_EVENT_TYPE,
  MARKETING_SEND_STATUS,
  marketingContactTable,
  marketingSequenceEnrollmentTable,
  marketingEmailSendTable,
  marketingEventTable,
} from '@/db/schema'

describe('Database Schema Constants Consistency', () => {
  // ============================
  // User Roles
  // ============================
  describe('ROLES_ENUM', () => {
    it('should have ADMIN and USER roles', () => {
      expect(ROLES_ENUM.ADMIN).toBe('admin')
      expect(ROLES_ENUM.USER).toBe('user')
    })

    it('should have exactly 2 roles', () => {
      expect(Object.keys(ROLES_ENUM)).toHaveLength(2)
    })

    it('should have lowercase values', () => {
      for (const value of Object.values(ROLES_ENUM)) {
        expect(value).toBe(value.toLowerCase())
      }
    })
  })

  describe('marketing lifecycle schema', () => {
    it('should export the expected marketing sequences', () => {
      expect(MARKETING_SEQUENCE.ONBOARDING).toBe('onboarding')
      expect(MARKETING_SEQUENCE.POST_PURCHASE).toBe('post_purchase')
      expect(MARKETING_SEQUENCE.WINBACK).toBe('winback')
      expect(Object.keys(MARKETING_SEQUENCE)).toHaveLength(3)
    })

    it('should export the expected enrollment and send statuses', () => {
      expect(MARKETING_ENROLLMENT_STATUS.ACTIVE).toBe('active')
      expect(MARKETING_ENROLLMENT_STATUS.COMPLETED).toBe('completed')
      expect(MARKETING_ENROLLMENT_STATUS.EXITED).toBe('exited')
      expect(MARKETING_SEND_STATUS.PENDING).toBe('pending')
      expect(MARKETING_SEND_STATUS.SENT).toBe('sent')
      expect(MARKETING_SEND_STATUS.FAILED).toBe('failed')
    })

    it('should export the expected marketing event types', () => {
      expect(MARKETING_EVENT_TYPE.USER_VERIFIED_EMAIL).toBe('user_verified_email')
      expect(MARKETING_EVENT_TYPE.PAYMENT_COMPLETED).toBe('payment_completed')
      expect(MARKETING_EVENT_TYPE.ONBOARDING_COMPLETED).toBe('onboarding_completed')
    })

    it('should expose the marketing lifecycle tables', () => {
      expect(getTableName(marketingContactTable)).toBe('marketing_contact')
      expect(getTableName(marketingSequenceEnrollmentTable)).toBe('marketing_sequence_enrollment')
      expect(getTableName(marketingEmailSendTable)).toBe('marketing_email_send')
      expect(getTableName(marketingEventTable)).toBe('marketing_event')
    })
  })
})
