import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNonInteractive, resetGlobalArgs } from './global-args.js'
import { openEditor } from './input.js'

describe('isNonInteractive', () => {
    const originalArgv = [...process.argv]
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalIsTTY = process.stdin.isTTY
        resetGlobalArgs()
        process.argv = ['node', 'tw', 'thread', 'create', '100', 'Title']
    })

    afterEach(() => {
        process.argv = originalArgv
        Object.defineProperty(process.stdin, 'isTTY', {
            value: originalIsTTY,
            configurable: true,
        })
        resetGlobalArgs()
    })

    it('returns true when stdin is not a TTY', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            configurable: true,
        })
        expect(isNonInteractive()).toBe(true)
    })

    it('returns false when stdin is a TTY', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: true,
            configurable: true,
        })
        expect(isNonInteractive()).toBe(false)
    })

    it('returns true when --non-interactive flag is set', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: true,
            configurable: true,
        })
        process.argv = [...process.argv, '--non-interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(true)
    })

    it('returns false when --interactive flag is set even without TTY', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            configurable: true,
        })
        process.argv = [...process.argv, '--interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(false)
    })

    it('--interactive overrides --non-interactive', () => {
        process.argv = [...process.argv, '--non-interactive', '--interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(false)
    })
})

vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}))

describe('openEditor', () => {
    const originalArgv = [...process.argv]
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalIsTTY = process.stdin.isTTY
        resetGlobalArgs()
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: originalIsTTY,
            configurable: true,
        })
        process.argv = originalArgv
        resetGlobalArgs()
    })

    it('returns null immediately in non-interactive mode', async () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            configurable: true,
        })

        const { spawn } = await import('node:child_process')
        const result = await openEditor()

        expect(result).toBeNull()
        expect(spawn).not.toHaveBeenCalled()
    })
})
