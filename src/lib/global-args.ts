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
    /** Path supplied via `--progress-jsonl <path>` (space form). cli-core deliberately
     * drops this form across CLIs (it can swallow positionals like
     * `tw inbox --progress-jsonl`); twist re-adds it because the flag is global. */
    progressJsonlSpacePath: string | undefined
}

function parseTwLocalFlags(argv: string[]): TwLocalFlags {
    let includePrivate = false
    let nonInteractive = false
    let interactive = false
    let progressJsonlSpacePath: string | undefined

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--') break
        if (arg === '--include-private-channels') {
            includePrivate = true
        } else if (arg === '--non-interactive') {
            nonInteractive = true
        } else if (arg === '--interactive') {
            interactive = true
        } else if (
            arg === '--progress-jsonl' &&
            i + 1 < argv.length &&
            !argv[i + 1].startsWith('-')
        ) {
            // Last one wins — keep walking and let later occurrences overwrite.
            progressJsonlSpacePath = argv[i + 1]
        }
    }

    return {
        includePrivateChannels: includePrivate,
        nonInteractive,
        interactive,
        progressJsonlSpacePath,
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

    // cli-core's `progressJsonl` is `false | true | string`. Layer the space
    // form on top: a space-form path overrides any bare detection, and a path
    // from either form (`=path` → cli-core, `<path>` → local) feeds
    // `progressJsonlPath` for callers that want the resolved path directly.
    const progressJsonl =
        local.progressJsonlSpacePath !== undefined
            ? local.progressJsonlSpacePath
            : base.progressJsonl
    const progressJsonlPath = typeof progressJsonl === 'string' ? progressJsonl : undefined

    return {
        ...base,
        progressJsonl,
        progressJsonlPath,
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
