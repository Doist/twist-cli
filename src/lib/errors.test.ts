import { TwistRequestError } from '@doist/twist-sdk'
import { describe, expect, it } from 'vitest'

import { isInsufficientScope } from './errors.js'

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
