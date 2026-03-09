import { afterEach, describe, expect, it } from 'vitest'
import { isAccessible } from '../../lib/output.js'

describe('isAccessible', () => {
    afterEach(() => {
        delete process.env.TW_ACCESSIBLE
        // Remove --accessible from argv if added
        const idx = process.argv.indexOf('--accessible')
        if (idx !== -1) process.argv.splice(idx, 1)
    })

    it('returns false by default', () => {
        expect(isAccessible()).toBe(false)
    })

    it('returns true when TW_ACCESSIBLE=1', () => {
        process.env.TW_ACCESSIBLE = '1'
        expect(isAccessible()).toBe(true)
    })

    it('returns false when TW_ACCESSIBLE is set to other values', () => {
        process.env.TW_ACCESSIBLE = '0'
        expect(isAccessible()).toBe(false)
        process.env.TW_ACCESSIBLE = 'true'
        expect(isAccessible()).toBe(false)
    })

    it('returns true when --accessible is in argv', () => {
        process.argv.push('--accessible')
        expect(isAccessible()).toBe(true)
    })
})
