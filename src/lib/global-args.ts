/**
 * Centralized, type-safe parsing of global CLI flags.
 *
 * Replaces scattered `process.argv.includes()` checks with a single parse
 * that correctly handles `--flag=value` variants and avoids false-positives
 * from option values.
 *
 * The result is lazily cached on first access — safe to call before or after
 * Commander's `parseAsync()` since it reads `process.argv` directly.
 */

export interface GlobalArgs {
    json: boolean
    ndjson: boolean
    noSpinner: boolean
    progressJsonl: boolean
    progressJsonlPath: string | undefined
    includePrivateChannels: boolean
    accessible: boolean
    nonInteractive: boolean
    interactive: boolean
}

/**
 * Parse well-known global flags from an argv array.
 *
 * Pure function — pass an explicit array for testing, or omit to use
 * `process.argv`.
 */
export function parseGlobalArgs(argv?: string[]): GlobalArgs {
    const args = argv ?? process.argv

    const has = (flag: string) =>
        args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`))

    // Parse --progress-jsonl with optional path value.
    // Supports: --progress-jsonl, --progress-jsonl=path, --progress-jsonl path
    // "Last one wins" when specified multiple times.
    const progressIndices = args
        .map((arg, index) => ({ arg, index }))
        .filter(({ arg }) => arg === '--progress-jsonl' || arg.startsWith('--progress-jsonl='))

    let progressJsonlPath: string | undefined
    if (progressIndices.length > 0) {
        const { arg, index } = progressIndices[progressIndices.length - 1]
        if (arg.includes('=')) {
            progressJsonlPath = arg.slice(arg.indexOf('=') + 1)
        } else if (index + 1 < args.length && !args[index + 1].startsWith('-')) {
            progressJsonlPath = args[index + 1]
        }
    }

    return {
        json: has('--json'),
        ndjson: has('--ndjson'),
        noSpinner: has('--no-spinner'),
        progressJsonl: progressIndices.length > 0,
        progressJsonlPath,
        includePrivateChannels: has('--include-private-channels'),
        accessible: has('--accessible'),
        nonInteractive: has('--non-interactive'),
        interactive: has('--interactive'),
    }
}

// ---------------------------------------------------------------------------
// Cached singleton
// ---------------------------------------------------------------------------

let cached: GlobalArgs | null = null

function getGlobalArgs(): GlobalArgs {
    if (!cached) {
        cached = parseGlobalArgs()
    }
    return cached
}

/** Clear the cached parse result. Call in test teardown. */
export function resetGlobalArgs(): void {
    cached = null
}

// ---------------------------------------------------------------------------
// Query functions — drop-in replacements for the old process.argv checks
// ---------------------------------------------------------------------------

export function isAccessible(): boolean {
    return process.env.TW_ACCESSIBLE === '1' || getGlobalArgs().accessible
}

export function isNonInteractive(): boolean {
    const args = getGlobalArgs()
    if (args.interactive) return false
    if (args.nonInteractive) return true
    return !process.stdin.isTTY
}

export function includePrivateChannels(): boolean {
    const envVal = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    if (envVal === '1' || envVal === 'true') {
        return true
    }
    return getGlobalArgs().includePrivateChannels
}

export function shouldDisableSpinner(): boolean {
    if (process.env.TW_SPINNER === 'false') return true
    if (process.env.CI) return true

    const args = getGlobalArgs()
    return args.json || args.ndjson || args.noSpinner || args.progressJsonl || args.nonInteractive
}

export function isProgressJsonlEnabled(): boolean {
    return getGlobalArgs().progressJsonl
}

export function getProgressJsonlPath(): string | undefined {
    return getGlobalArgs().progressJsonlPath
}
