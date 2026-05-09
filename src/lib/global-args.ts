/**
 * Per-CLI extension of `@doist/cli-core`'s global-args parser.
 *
 * Layers twist's `--include-private-channels`, `--non-interactive`,
 * `--interactive`, and the `--progress-jsonl <path>` space form on top of
 * the canonical shape (`--json`, `--ndjson`, `--quiet`, `--verbose`,
 * `--accessible`, `--no-spinner`, `--progress-jsonl[=path]`).
 */

import {
    createAccessibleGate,
    createGlobalArgsStore,
    createSpinnerGate,
    type GlobalArgs as CoreGlobalArgs,
    parseGlobalArgs as parseCoreGlobalArgs,
} from '@doist/cli-core'

export type TwGlobalArgs = CoreGlobalArgs & {
    /** Resolved path for `--progress-jsonl` (any form). `undefined` when bare or absent. */
    progressJsonlPath: string | undefined
    includePrivateChannels: boolean
    nonInteractive: boolean
    interactive: boolean
}

/** Back-compat alias — pre-cli-core twist code imported `GlobalArgs` from this module. */
export type GlobalArgs = TwGlobalArgs

type TwLocalFlags = {
    includePrivateChannels: boolean
    nonInteractive: boolean
    interactive: boolean
    /**
     * Resolved value for `--progress-jsonl` across all three forms (bare,
     * `=path`, space-separated `<path>`). `false` = absent, `true` = bare,
     * string = path. Twist parses this locally — and ignores cli-core's
     * `progressJsonl` field — so that "last occurrence wins" stays correct
     * when the forms are mixed (`tw --progress-jsonl=/a --progress-jsonl /b`
     * → `/b`). cli-core deliberately drops the space form cross-CLI because
     * it can swallow positionals (`td task add --progress-jsonl "Buy milk"`);
     * twist re-adds it because the flag is global, not subcommand-attached.
     */
    progressJsonl: string | true | false
}

function parseTwLocalFlags(argv: string[]): TwLocalFlags {
    let includePrivate = false
    let nonInteractive = false
    let interactive = false
    let progressJsonl: string | true | false = false

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--') break
        if (arg === '--include-private-channels') {
            includePrivate = true
        } else if (arg === '--non-interactive') {
            nonInteractive = true
        } else if (arg === '--interactive') {
            interactive = true
        } else if (arg === '--progress-jsonl') {
            // Bare or space form. Last one wins — overwrite any prior value.
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                progressJsonl = argv[i + 1]
                i++
            } else {
                progressJsonl = true
            }
        } else if (arg.startsWith('--progress-jsonl=')) {
            progressJsonl = arg.slice('--progress-jsonl='.length)
        }
    }

    return {
        includePrivateChannels: includePrivate,
        nonInteractive,
        interactive,
        progressJsonl,
    }
}

/**
 * Parse well-known global flags from an argv array. Pure — pass an explicit
 * array for testing, or omit to read `process.argv`.
 */
export function parseGlobalArgs(argv?: string[]): TwGlobalArgs {
    const args = argv ?? process.argv
    const base = parseCoreGlobalArgs(args)
    const local = parseTwLocalFlags(args)

    return {
        ...base,
        progressJsonl: local.progressJsonl,
        progressJsonlPath:
            typeof local.progressJsonl === 'string' ? local.progressJsonl : undefined,
        includePrivateChannels: local.includePrivateChannels,
        nonInteractive: local.nonInteractive,
        interactive: local.interactive,
    }
}

const store = createGlobalArgsStore<TwGlobalArgs>(() => parseGlobalArgs())

/** Clear the cached parse result. Call in test teardown. */
export const resetGlobalArgs = store.reset

// ---------------------------------------------------------------------------
// Query functions — drop-in replacements for the old process.argv checks
// ---------------------------------------------------------------------------

export function isJsonMode(): boolean {
    return store.get().json
}

export function isNonInteractive(): boolean {
    const args = store.get()
    if (args.interactive) return false
    if (args.nonInteractive) return true
    return !process.stdin.isTTY
}

export function includePrivateChannels(): boolean {
    const envVal = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    if (envVal === '1' || envVal === 'true') {
        return true
    }
    return store.get().includePrivateChannels
}

export function isProgressJsonlEnabled(): boolean {
    return store.get().progressJsonl !== false
}

export function getProgressJsonlPath(): string | undefined {
    return store.get().progressJsonlPath
}

export const isAccessible = createAccessibleGate({
    envVar: 'TW_ACCESSIBLE',
    getArgs: store.get,
})

export const shouldDisableSpinner = createSpinnerGate({
    envVar: 'TW_SPINNER',
    getArgs: store.get,
    extraTriggers: () => store.get().nonInteractive,
})
