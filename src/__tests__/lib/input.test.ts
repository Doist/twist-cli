import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNonInteractive, openEditor } from '../../lib/input.js'

describe('isNonInteractive', () => {
    const originalArgv = process.argv
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalIsTTY = process.stdin.isTTY
        process.argv = ['node', 'tw', 'thread', 'create', '100', 'Title']
    })

    afterEach(() => {
        process.argv = originalArgv
        Object.defineProperty(process.stdin, 'isTTY', {
            value: originalIsTTY,
            configurable: true,
        })
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
        expect(isNonInteractive()).toBe(true)
    })

    it('returns false when --interactive flag is set even without TTY', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            configurable: true,
        })
        process.argv = [...process.argv, '--interactive']
        expect(isNonInteractive()).toBe(false)
    })

    it('--interactive overrides --non-interactive', () => {
        process.argv = [...process.argv, '--non-interactive', '--interactive']
        expect(isNonInteractive()).toBe(false)
    })
})

vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}))

describe('openEditor', () => {
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalIsTTY = process.stdin.isTTY
    })

    afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: originalIsTTY,
            configurable: true,
        })
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
