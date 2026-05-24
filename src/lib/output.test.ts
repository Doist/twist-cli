import { captureConsole } from '@doist/cli-core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseCliError } from './errors.js'
import { isAccessible, resetGlobalArgs } from './global-args.js'
import { formatError, formatErrorJson, printDryRun, printEmpty } from './output.js'

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
        const logSpy = captureConsole()

        printDryRun('delete thread', { Thread: 'My thread (500)' })

        expect(logSpy).toHaveBeenNthCalledWith(1, '[dry-run] Would delete thread:')
        expect(logSpy).toHaveBeenNthCalledWith(2, '  Thread: My thread (500)')
        expect(logSpy).toHaveBeenNthCalledWith(3, 'Run without --dry-run to execute.')
    })

    it('skips undefined values', () => {
        const logSpy = captureConsole()

        printDryRun('mute thread', {
            Thread: 'My thread (500)',
            Notes: undefined,
            Duration: '60 minutes',
        })

        const calls = logSpy.mock.calls.map((c) => c[0])
        expect(calls).toContain('  Thread: My thread (500)')
        expect(calls).toContain('  Duration: 60 minutes')
        expect(calls.some((line) => String(line).includes('Notes'))).toBe(false)
    })

    it('indents continuation lines for multiline values', () => {
        const logSpy = captureConsole()

        printDryRun('update thread', {
            Content: 'First line\nSecond line\nThird line',
        })

        expect(logSpy).toHaveBeenNthCalledWith(1, '[dry-run] Would update thread:')
        expect(logSpy).toHaveBeenNthCalledWith(2, '  Content: First line')
        expect(logSpy).toHaveBeenNthCalledWith(3, '    Second line')
        expect(logSpy).toHaveBeenNthCalledWith(4, '    Third line')
        expect(logSpy).toHaveBeenNthCalledWith(5, 'Run without --dry-run to execute.')
    })

    it('works without details', () => {
        const logSpy = captureConsole()

        printDryRun('clear away status')

        expect(logSpy).toHaveBeenCalledWith('[dry-run] Would clear away status:')
        expect(logSpy).toHaveBeenCalledWith('Run without --dry-run to execute.')
    })
})

describe('printEmpty', () => {
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        logSpy = captureConsole()
    })

    it('prints "[]" for --json', () => {
        printEmpty({ options: { json: true }, type: 'thread', message: 'No threads in inbox.' })
        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledWith('[]')
    })

    it('does not call console.log at all for --ndjson (no stray newline)', () => {
        printEmpty({ options: { ndjson: true }, type: 'thread', message: 'No threads in inbox.' })
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('prints the human message when neither --json nor --ndjson is set', () => {
        printEmpty({ options: {}, type: 'thread', message: 'No threads in inbox.' })
        expect(logSpy).toHaveBeenCalledWith('No threads in inbox.')
    })

    it('--json takes precedence over --ndjson when both are set', () => {
        printEmpty({
            options: { json: true, ndjson: true },
            type: 'conversation',
            message: 'unused',
        })
        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledWith('[]')
    })
})

describe('formatError with BaseCliError', () => {
    it('formats a cli-core CliError instance (code, message, hints)', () => {
        const err = new BaseCliError('FILE_READ_ERROR', 'Could not read changelog file', {
            hints: ['Check the file path'],
        })
        const result = formatError(err)
        expect(result).toContain('Error: FILE_READ_ERROR')
        expect(result).toContain('Could not read changelog file')
        expect(result).toContain('Check the file path')
    })
})

describe('formatErrorJson with BaseCliError', () => {
    it('serializes a cli-core CliError instance', () => {
        const err = new BaseCliError('INVALID_TYPE', 'Count must be a positive integer')
        const parsed = JSON.parse(formatErrorJson(err))
        expect(parsed).toEqual({
            error: {
                code: 'INVALID_TYPE',
                message: 'Count must be a positive integer',
                hints: undefined,
            },
        })
    })
})
