import { TwistRequestError } from '@doist/twist-sdk'
import { describe, expect, it } from 'vitest'

import { isForbidden, isInsufficientScope } from './errors.js'

describe('isInsufficientScope', () => {
    it('returns true for a 403 with "Insufficient scope" error_string', () => {
        const error = new TwistRequestError('Request failed with status 403', 403, {
            error_code: 109,
            error_string: 'Insufficient scope provided: user:write',
        })
        expect(isInsufficientScope(error)).toBe(true)
    })

    it('returns false for a 403 without "Insufficient scope"', () => {
        const error = new TwistRequestError('Request failed with status 403', 403, {
            error_code: 100,
            error_string: 'Access denied',
        })
        expect(isInsufficientScope(error)).toBe(false)
    })

    it('returns false for non-403 errors', () => {
        const error = new TwistRequestError('Request failed with status 401', 401, {
            error_code: 100,
            error_string: 'Insufficient scope provided: user:write',
        })
        expect(isInsufficientScope(error)).toBe(false)
    })

    it('returns false for plain errors', () => {
        expect(isInsufficientScope(new Error('something'))).toBe(false)
    })

    it('returns false for non-error values', () => {
        expect(isInsufficientScope(null)).toBe(false)
        expect(isInsufficientScope(undefined)).toBe(false)
        expect(isInsufficientScope('string')).toBe(false)
    })
})

describe('isForbidden', () => {
    it('returns true for any 403 — even without responseData', () => {
        const error = new TwistRequestError('Request failed with status 403', 403, undefined)
        expect(isForbidden(error)).toBe(true)
    })

    it('returns true for a 403 with an arbitrary error_string', () => {
        const error = new TwistRequestError('Request failed with status 403', 403, {
            error_code: 100,
            error_string: 'Access denied',
        })
        expect(isForbidden(error)).toBe(true)
    })

    it('returns false for non-403 status codes', () => {
        expect(isForbidden(new TwistRequestError('Request failed with status 401', 401, {}))).toBe(
            false,
        )
        expect(isForbidden(new TwistRequestError('Request failed with status 404', 404, {}))).toBe(
            false,
        )
        expect(isForbidden(new TwistRequestError('Request failed with status 500', 500, {}))).toBe(
            false,
        )
    })

    it('returns false for plain errors and non-object values', () => {
        expect(isForbidden(new Error('something'))).toBe(false)
        expect(isForbidden(null)).toBe(false)
        expect(isForbidden(undefined)).toBe(false)
        expect(isForbidden('string')).toBe(false)
    })

    // Precedence: both predicates fire on a scope 403, so callers must test
    // isInsufficientScope first (the central handler in api.ts does).
    it('fires alongside isInsufficientScope for an "Insufficient scope" 403', () => {
        const error = new TwistRequestError('Request failed with status 403', 403, {
            error_code: 109,
            error_string: 'Insufficient scope provided: user:write',
        })
        expect(isInsufficientScope(error)).toBe(true)
        expect(isForbidden(error)).toBe(true)
    })
})
