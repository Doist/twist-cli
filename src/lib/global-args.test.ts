import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    getProgressJsonlPath,
    includePrivateChannels,
    isAccessible,
    isNonInteractive,
    isProgressJsonlEnabled,
    parseGlobalArgs,
    resetGlobalArgs,
    shouldDisableSpinner,
} from './global-args.js'

describe('parseGlobalArgs', () => {
    describe('long flags', () => {
        it('parses --json', () => {
            expect(parseGlobalArgs(['--json']).json).toBe(true)
        })

        it('parses --ndjson', () => {
            expect(parseGlobalArgs(['--ndjson']).ndjson).toBe(true)
        })

        it('parses --no-spinner', () => {
            expect(parseGlobalArgs(['--no-spinner']).noSpinner).toBe(true)
        })

        it('parses --accessible', () => {
            expect(parseGlobalArgs(['--accessible']).accessible).toBe(true)
        })

        it('parses --non-interactive', () => {
            expect(parseGlobalArgs(['--non-interactive']).nonInteractive).toBe(true)
        })

        it('parses --interactive', () => {
            expect(parseGlobalArgs(['--interactive']).interactive).toBe(true)
        })

        it('parses --include-private-channels', () => {
            expect(parseGlobalArgs(['--include-private-channels']).includePrivateChannels).toBe(
                true,
            )
        })

        it('defaults all flags to false/undefined', () => {
            const result = parseGlobalArgs([])
            expect(result).toEqual({
                json: false,
                ndjson: false,
                accessible: false,
                noSpinner: false,
                progressJsonl: false,
                progressJsonlPath: undefined,
                includePrivateChannels: false,
                nonInteractive: false,
                interactive: false,
            })
        })
    })

    describe('--progress-jsonl', () => {
        it('detects --progress-jsonl without path', () => {
            const result = parseGlobalArgs(['node', 'tw', '--progress-jsonl'])
            expect(result.progressJsonl).toBe(true)
            expect(result.progressJsonlPath).toBeUndefined()
        })

        it('detects --progress-jsonl=path', () => {
            const result = parseGlobalArgs(['node', 'tw', '--progress-jsonl=/tmp/out.jsonl'])
            expect(result.progressJsonl).toBe('/tmp/out.jsonl')
            expect(result.progressJsonlPath).toBe('/tmp/out.jsonl')
        })

        it('detects --progress-jsonl path as separate arg (twist re-adds the space form cli-core drops)', () => {
            const result = parseGlobalArgs(['node', 'tw', '--progress-jsonl', '/tmp/out.jsonl'])
            expect(result.progressJsonl).toBe('/tmp/out.jsonl')
            expect(result.progressJsonlPath).toBe('/tmp/out.jsonl')
        })

        it('does not treat next flag as path', () => {
            const result = parseGlobalArgs(['node', 'tw', '--progress-jsonl', '--json'])
            expect(result.progressJsonl).toBe(true)
            expect(result.progressJsonlPath).toBeUndefined()
        })

        // Twist parses --progress-jsonl locally (not via cli-core) so last-occurrence
        // ordering stays correct when the forms are mixed. Regression for #209 review.
        describe('last-occurrence-wins across mixed forms', () => {
            it('=path then space form: space form wins', () => {
                const result = parseGlobalArgs([
                    'node',
                    'tw',
                    '--progress-jsonl=/tmp/first',
                    '--progress-jsonl',
                    '/tmp/second',
                ])
                expect(result.progressJsonl).toBe('/tmp/second')
                expect(result.progressJsonlPath).toBe('/tmp/second')
            })

            it('space form then =path: =path wins', () => {
                const result = parseGlobalArgs([
                    'node',
                    'tw',
                    '--progress-jsonl',
                    '/tmp/first',
                    '--progress-jsonl=/tmp/second',
                ])
                expect(result.progressJsonl).toBe('/tmp/second')
                expect(result.progressJsonlPath).toBe('/tmp/second')
            })

            it('path then bare: bare reverts to true (no path)', () => {
                const result = parseGlobalArgs([
                    'node',
                    'tw',
                    '--progress-jsonl',
                    '/tmp/first',
                    '--progress-jsonl',
                ])
                expect(result.progressJsonl).toBe(true)
                expect(result.progressJsonlPath).toBeUndefined()
            })

            it('repeated =path forms: last wins', () => {
                const result = parseGlobalArgs([
                    'node',
                    'tw',
                    '--progress-jsonl=/tmp/first',
                    '--progress-jsonl=/tmp/second',
                ])
                expect(result.progressJsonl).toBe('/tmp/second')
                expect(result.progressJsonlPath).toBe('/tmp/second')
            })
        })
    })
})

describe('cached singleton', () => {
    const originalArgv = [...process.argv]

    beforeEach(() => {
        resetGlobalArgs()
        process.argv = ['node', 'tw']
    })

    afterEach(() => {
        process.argv = originalArgv
        resetGlobalArgs()
    })

    it('returns fresh results after resetGlobalArgs()', () => {
        process.argv = ['node', 'tw']
        expect(isProgressJsonlEnabled()).toBe(false)

        resetGlobalArgs()
        process.argv = ['node', 'tw', '--progress-jsonl']
        expect(isProgressJsonlEnabled()).toBe(true)
    })

    it('exposes the resolved path via getProgressJsonlPath()', () => {
        process.argv = ['node', 'tw', '--progress-jsonl', '/tmp/out.jsonl']
        expect(getProgressJsonlPath()).toBe('/tmp/out.jsonl')
    })
})

describe('isAccessible', () => {
    const originalArgv = [...process.argv]

    beforeEach(() => {
        resetGlobalArgs()
        process.argv = ['node', 'tw']
        delete process.env.TW_ACCESSIBLE
    })

    afterEach(() => {
        process.argv = originalArgv
        delete process.env.TW_ACCESSIBLE
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

describe('isNonInteractive', () => {
    const originalArgv = [...process.argv]
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalIsTTY = process.stdin.isTTY
        resetGlobalArgs()
        process.argv = ['node', 'tw']
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

    it('returns true when --non-interactive is set', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: true,
            configurable: true,
        })
        process.argv = ['node', 'tw', '--non-interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(true)
    })

    it('returns false when --interactive is set even without TTY', () => {
        Object.defineProperty(process.stdin, 'isTTY', {
            value: undefined,
            configurable: true,
        })
        process.argv = ['node', 'tw', '--interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(false)
    })

    it('--interactive overrides --non-interactive', () => {
        process.argv = ['node', 'tw', '--non-interactive', '--interactive']
        resetGlobalArgs()
        expect(isNonInteractive()).toBe(false)
    })
})

describe('includePrivateChannels', () => {
    const originalArgv = [...process.argv]
    const originalEnv = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS

    beforeEach(() => {
        resetGlobalArgs()
        process.argv = ['node', 'tw']
        delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    })

    afterEach(() => {
        process.argv = originalArgv
        if (originalEnv !== undefined) {
            process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = originalEnv
        } else {
            delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
        }
        resetGlobalArgs()
    })

    it('returns false by default', () => {
        expect(includePrivateChannels()).toBe(false)
    })

    it('returns true when --include-private-channels is in argv', () => {
        process.argv = ['node', 'tw', '--include-private-channels']
        resetGlobalArgs()
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns true when TWIST_INCLUDE_PRIVATE_CHANNELS=1', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '1'
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns true when TWIST_INCLUDE_PRIVATE_CHANNELS=true', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = 'true'
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns false for other env values', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '0'
        expect(includePrivateChannels()).toBe(false)
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = 'false'
        expect(includePrivateChannels()).toBe(false)
    })
})

describe('shouldDisableSpinner', () => {
    const originalArgv = [...process.argv]

    beforeEach(() => {
        resetGlobalArgs()
        process.argv = ['node', 'tw']
        delete process.env.TW_SPINNER
        delete process.env.CI
    })

    afterEach(() => {
        process.argv = originalArgv
        delete process.env.TW_SPINNER
        delete process.env.CI
        resetGlobalArgs()
    })

    it('returns false by default', () => {
        expect(shouldDisableSpinner()).toBe(false)
    })

    it('returns true when TW_SPINNER=false', () => {
        process.env.TW_SPINNER = 'false'
        expect(shouldDisableSpinner()).toBe(true)
    })

    it('returns true when CI is set', () => {
        process.env.CI = 'true'
        expect(shouldDisableSpinner()).toBe(true)
    })

    it("treats CI='false' as opt-out (does not disable the spinner)", () => {
        // cli-core's isCI() honours CI='false' as a deliberate opt-out so a
        // nested invocation can run interactively even when the parent shell
        // exports CI=true. Regression test for the cli-core gate.
        process.env.CI = 'false'
        expect(shouldDisableSpinner()).toBe(false)
    })

    it.each([
        ['--json', ['node', 'tw', '--json']],
        ['--ndjson', ['node', 'tw', '--ndjson']],
        ['--no-spinner', ['node', 'tw', '--no-spinner']],
        ['--progress-jsonl', ['node', 'tw', '--progress-jsonl']],
        ['--non-interactive', ['node', 'tw', '--non-interactive']],
    ])('returns true with %s flag', (_flag, argv) => {
        process.argv = argv
        resetGlobalArgs()
        expect(shouldDisableSpinner()).toBe(true)
    })
})
