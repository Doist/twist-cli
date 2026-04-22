import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAccessible, resetGlobalArgs } from './global-args.js'
import { printDryRun } from './output.js'

vi.mock('chalk')

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

describe('printDryRun', () => {
    it('prints header, details, and footer', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        printDryRun('delete thread', { Thread: 'My thread (500)' })

        expect(logSpy).toHaveBeenNthCalledWith(1, '[dry-run] Would delete thread:')
        expect(logSpy).toHaveBeenNthCalledWith(2, '  Thread: My thread (500)')
        expect(logSpy).toHaveBeenNthCalledWith(3, 'Run without --dry-run to execute.')

        logSpy.mockRestore()
    })

    it('skips undefined values', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        printDryRun('mute thread', {
            Thread: 'My thread (500)',
            Notes: undefined,
            Duration: '60 minutes',
        })

        const calls = logSpy.mock.calls.map((c) => c[0])
        expect(calls).toContain('  Thread: My thread (500)')
        expect(calls).toContain('  Duration: 60 minutes')
        expect(calls.some((line) => String(line).includes('Notes'))).toBe(false)

        logSpy.mockRestore()
    })

    it('indents continuation lines for multiline values', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        printDryRun('update thread', {
            Content: 'First line\nSecond line\nThird line',
        })

        expect(logSpy).toHaveBeenNthCalledWith(1, '[dry-run] Would update thread:')
        expect(logSpy).toHaveBeenNthCalledWith(2, '  Content: First line')
        expect(logSpy).toHaveBeenNthCalledWith(3, '    Second line')
        expect(logSpy).toHaveBeenNthCalledWith(4, '    Third line')
        expect(logSpy).toHaveBeenNthCalledWith(5, 'Run without --dry-run to execute.')

        logSpy.mockRestore()
    })

    it('works without details', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        printDryRun('clear away status')

        expect(logSpy).toHaveBeenCalledWith('[dry-run] Would clear away status:')
        expect(logSpy).toHaveBeenCalledWith('Run without --dry-run to execute.')

        logSpy.mockRestore()
    })
})
