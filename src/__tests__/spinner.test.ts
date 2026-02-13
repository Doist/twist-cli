import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import yoctoSpinnerFactory from 'yocto-spinner'
import {
    LoadingSpinner,
    resetEarlySpinner,
    startEarlySpinner,
    stopEarlySpinner,
    withSpinner,
} from '../lib/spinner.js'

// Mock yocto-spinner
const mockSpinnerInstance = {
    start: vi.fn().mockReturnThis(),
    success: vi.fn(),
    error: vi.fn(),
    stop: vi.fn(),
    text: '',
}

vi.mock('yocto-spinner', () => ({
    default: vi.fn(() => mockSpinnerInstance),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        yellow: vi.fn((text) => text),
        blue: vi.fn((text) => text),
        red: vi.fn((text) => text),
        gray: vi.fn((text) => text),
        cyan: vi.fn((text) => text),
        magenta: vi.fn((text) => text),
    },
}))

describe('withSpinner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
        // Reset environment variables
        delete process.env.TW_SPINNER
        delete process.env.CI
        // Mock TTY as true by default
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true,
        })
        // Clear process.argv
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
    })

    it('should handle successful operations', async () => {
        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).toHaveBeenCalled()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
        expect(mockSpinnerInstance.error).not.toHaveBeenCalled()
    })

    it('should handle failed operations', async () => {
        await expect(
            withSpinner({ text: 'Testing...', color: 'blue' }, async () => {
                throw new Error('test error')
            }),
        ).rejects.toThrow('test error')

        expect(mockSpinnerInstance.start).toHaveBeenCalled()
        expect(mockSpinnerInstance.error).toHaveBeenCalled()
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()
    })

    it('should not show spinner when noSpinner option is true', async () => {
        const result = await withSpinner(
            { text: 'Testing...', color: 'blue', noSpinner: true },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner when TW_SPINNER=false', async () => {
        process.env.TW_SPINNER = 'false'

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner in CI environment', async () => {
        process.env.CI = 'true'

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it('should not show spinner when not in TTY', async () => {
        Object.defineProperty(process.stdout, 'isTTY', {
            value: false,
            configurable: true,
        })

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })

    it.each([
        ['--json', ['node', 'tw', 'auth', 'status', '--json']],
        ['--ndjson', ['node', 'tw', 'auth', 'status', '--ndjson']],
        ['--no-spinner', ['node', 'tw', 'auth', 'status', '--no-spinner']],
        ['--progress-jsonl', ['node', 'tw', 'threads', '--progress-jsonl']],
        [
            '--progress-jsonl=path',
            ['node', 'tw', 'threads', '--progress-jsonl=/tmp/progress.jsonl'],
        ],
    ])('should not show spinner with %s flag', async (_flagName, argv) => {
        process.argv = argv

        const result = await withSpinner(
            { text: 'Testing...', color: 'blue' },
            async () => 'success',
        )

        expect(result).toBe('success')
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
    })
})

describe('LoadingSpinner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
        // Reset environment variables
        delete process.env.TW_SPINNER
        delete process.env.CI
        // Mock TTY as true by default
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true,
        })
        // Clear process.argv
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
    })

    it('should start and stop spinner', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        spinner.stop()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should show success message', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.succeed('Operation completed')
        expect(mockSpinnerInstance.success).toHaveBeenCalledWith('✓ Operation completed')
    })

    it('should show failure message', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.fail('Operation failed')
        expect(mockSpinnerInstance.error).toHaveBeenCalledWith('✗ Operation failed')
    })

    it('should handle multiple calls to stop gracefully', () => {
        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Testing...', color: 'blue' })
        spinner.stop()
        spinner.stop() // Should not throw

        expect(mockSpinnerInstance.stop).toHaveBeenCalledTimes(1)
    })

    it('should handle succeed/fail without starting', () => {
        const spinner = new LoadingSpinner()
        spinner.succeed('Test') // Should not throw
        spinner.fail('Test') // Should not throw

        expect(mockSpinnerInstance.success).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.error).not.toHaveBeenCalled()
    })
})

describe('early spinner', () => {
    let savedStdoutWrite: typeof process.stdout.write

    beforeEach(() => {
        vi.clearAllMocks()
        resetEarlySpinner()
        savedStdoutWrite = process.stdout.write
        delete process.env.TW_SPINNER
        delete process.env.CI
        Object.defineProperty(process.stdout, 'isTTY', {
            value: true,
            configurable: true,
        })
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        process.stdout.write = savedStdoutWrite
        resetEarlySpinner()
        vi.clearAllMocks()
    })

    it('should start and stop early spinner', () => {
        startEarlySpinner()
        expect(yoctoSpinnerFactory).toHaveBeenCalledWith({ text: 'Loading...' })
        expect(mockSpinnerInstance.start).toHaveBeenCalled()

        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should not start when not TTY', () => {
        Object.defineProperty(process.stdout, 'isTTY', {
            value: false,
            configurable: true,
        })
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should not start with --json flag', () => {
        process.argv = ['node', 'tw', 'inbox', '--json']
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should not start with --ndjson flag', () => {
        process.argv = ['node', 'tw', 'inbox', '--ndjson']
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should not start with --no-spinner flag', () => {
        process.argv = ['node', 'tw', 'inbox', '--no-spinner']
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should not start in CI', () => {
        process.env.CI = 'true'
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should not start when TW_SPINNER=false', () => {
        process.env.TW_SPINNER = 'false'
        startEarlySpinner()
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
    })

    it('should be adopted by LoadingSpinner.start()', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Fetching data...', color: 'blue' })

        // Should NOT create a new spinner — it adopts the early one
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.start).not.toHaveBeenCalled()
        // Should update the text on the adopted instance
        expect(mockSpinnerInstance.text).toBe('Fetching data...')
    })

    it('should release back on stop() so next API call can re-adopt', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        const spinner1 = new LoadingSpinner()
        spinner1.start({ text: 'First call...', color: 'blue' })
        spinner1.stop()

        // Should NOT have called stop — released back
        expect(mockSpinnerInstance.stop).not.toHaveBeenCalled()

        // Second spinner should also adopt (not create new)
        const spinner2 = new LoadingSpinner()
        spinner2.start({ text: 'Second call...', color: 'blue' })
        expect(yoctoSpinnerFactory).not.toHaveBeenCalled()
        expect(mockSpinnerInstance.text).toBe('Second call...')
    })

    it('should actually stop on fail() even if adopted', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        const spinner = new LoadingSpinner()
        spinner.start({ text: 'Failing...', color: 'blue' })
        spinner.fail('Something went wrong')

        expect(mockSpinnerInstance.error).toHaveBeenCalledWith('✗ Something went wrong')
    })

    it('should auto-stop when stdout is written to', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        // Writing to stdout should trigger auto-stop
        process.stdout.write('hello')

        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })

    it('should be cleaned up by stopEarlySpinner() if never adopted', () => {
        startEarlySpinner()
        vi.clearAllMocks()

        stopEarlySpinner()
        expect(mockSpinnerInstance.stop).toHaveBeenCalled()
    })
})
