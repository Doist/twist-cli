import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeDate, parseDate } from '../../lib/dates.js'

describe('formatRelativeDate', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns "just now" for times less than a minute ago', () => {
        const date = new Date('2024-06-15T11:59:30Z')
        expect(formatRelativeDate(date)).toBe('just now')
    })

    it('returns minutes ago for times less than an hour ago', () => {
        expect(formatRelativeDate(new Date('2024-06-15T11:55:00Z'))).toBe('5 minutes ago')
        expect(formatRelativeDate(new Date('2024-06-15T11:59:00Z'))).toBe('1 minute ago')
        expect(formatRelativeDate(new Date('2024-06-15T11:30:00Z'))).toBe('30 minutes ago')
    })

    it('returns hours ago for times less than a day ago', () => {
        expect(formatRelativeDate(new Date('2024-06-15T10:00:00Z'))).toBe('2 hours ago')
        expect(formatRelativeDate(new Date('2024-06-15T11:00:00Z'))).toBe('1 hour ago')
    })

    it('returns "yesterday" for times 1-2 days ago', () => {
        expect(formatRelativeDate(new Date('2024-06-14T12:00:00Z'))).toBe('yesterday')
    })

    it('returns days ago for times less than a week ago', () => {
        expect(formatRelativeDate(new Date('2024-06-12T12:00:00Z'))).toBe('3 days ago')
        expect(formatRelativeDate(new Date('2024-06-10T12:00:00Z'))).toBe('5 days ago')
    })

    it('returns absolute date for older times', () => {
        const result = formatRelativeDate(new Date('2024-05-01T12:00:00Z'))
        expect(result).toMatch(/May 1/)
    })

    it('includes year for dates from previous years', () => {
        const result = formatRelativeDate(new Date('2023-01-15T12:00:00Z'))
        expect(result).toMatch(/Jan 15, 2023/)
    })

    it('handles string dates', () => {
        expect(formatRelativeDate('2024-06-15T11:59:00Z')).toBe('1 minute ago')
    })
})

describe('parseDate', () => {
    it('parses valid ISO dates', () => {
        const result = parseDate('2024-06-15T12:00:00Z')
        expect(result).toBeInstanceOf(Date)
        expect(result?.toISOString()).toBe('2024-06-15T12:00:00.000Z')
    })

    it('parses date-only strings', () => {
        const result = parseDate('2024-06-15')
        expect(result).toBeInstanceOf(Date)
    })

    it('returns null for invalid dates', () => {
        expect(parseDate('invalid')).toBeNull()
        expect(parseDate('')).toBeNull()
    })
})
