import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAccessible, resetGlobalArgs } from '../../lib/global-args.js'

describe('isAccessible', () => {
    const originalArgv = [...process.argv]

    beforeEach(() => {
        resetGlobalArgs()
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        delete process.env.TW_ACCESSIBLE
        process.argv = originalArgv
        resetGlobalArgs()
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
        process.argv = ['node', 'tw', '--accessible']
        resetGlobalArgs()
        expect(isAccessible()).toBe(true)
    })
})
