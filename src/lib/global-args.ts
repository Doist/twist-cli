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
    /** --user <ref> — selects which stored Twist account to use. */
    user: string | undefined
}

/**
 * Parse well-known global flags from an argv array.
 *
 * Pure function — pass an explicit array for testing, or omit to use
 * `process.argv`.
 *
 * Honors the `--` terminator: anything after it is treated as positional and
 * ignored by global-flag detection (so `tw msg send -- --user=bot` does not
 * misroute as account selection).
 */
export function parseGlobalArgs(argv?: string[]): GlobalArgs {
    const fullArgs = argv ?? process.argv
    const terminatorIndex = fullArgs.indexOf('--')
    const args = terminatorIndex === -1 ? fullArgs : fullArgs.slice(0, terminatorIndex)

    const has = (flag: string) =>
        args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`))

    // --progress-jsonl supports --progress-jsonl, --progress-jsonl=path, and
    // --progress-jsonl path. "Last one wins" when specified multiple times.
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

    // --user <ref> | --user=<ref> | --user (no value — left undefined so the
    // pre-parse validator can surface a clear usage error before commander
    // runs).
    let user: string | undefined
    const userIndices = args
        .map((arg, index) => ({ arg, index }))
        .filter(({ arg }) => arg === '--user' || arg.startsWith('--user='))
    if (userIndices.length > 0) {
        const { arg, index } = userIndices[userIndices.length - 1]
        if (arg.includes('=')) {
            user = arg.slice(arg.indexOf('=') + 1)
        } else if (index + 1 < args.length && !args[index + 1].startsWith('-')) {
            // Only consume the next arg as the value when it doesn't look
            // like another flag — keeps `tw --user --json …` from silently
            // swallowing `--json`.
            user = args[index + 1]
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
        user,
    }
}

/**
 * Validate the `--user` flag from an argv slice. Single source of truth for
 * the pre-Commander validation in `src/index.ts`.
 *
 * Returns:
 *  - `{ ok: true, ref }` — valid value (possibly undefined when --user wasn't passed)
 *  - `{ ok: false, message, hints }` — invalid; caller should raise CliError
 *
 * `knownCommands` lets the validator catch the common typo
 * `tw --user list` (forgot the value, list looks like a subcommand). Pass the
 * full set of subcommand names + aliases.
 */
export type UserFlagValidation =
    | { ok: true; ref: string | undefined }
    | { ok: false; message: string; hints: string[] }

export function validateUserFlag(
    argv: string[],
    knownCommands: ReadonlySet<string>,
): UserFlagValidation {
    const terminatorIndex = argv.indexOf('--')
    const scanRange = terminatorIndex === -1 ? argv : argv.slice(0, terminatorIndex)
    const sawUserFlag = scanRange.some((a) => a === '--user' || a.startsWith('--user='))
    if (!sawUserFlag) return { ok: true, ref: undefined }

    const ref = parseGlobalArgs(argv).user
    if (!ref) {
        return {
            ok: false,
            message: '--user requires a value: <id|email>.',
            hints: ['Example: tw --user me@example.com inbox'],
        }
    }
    if (knownCommands.has(ref)) {
        return {
            ok: false,
            message: `--user requires a value: <id|email>. Got "${ref}", which looks like a subcommand — did you forget the value?`,
            hints: [`Example: tw --user me@example.com ${ref}`],
        }
    }
    return { ok: true, ref }
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

export function isJsonMode(): boolean {
    return getGlobalArgs().json
}

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

export function getRequestedUserRef(): string | undefined {
    return getGlobalArgs().user
}

/**
 * Remove `--user <ref>` / `--user=<ref>` from an argv array so commander —
 * which has no global-option attachment — never sees the flag at subcommand
 * level. Returns a new array; the original is not mutated. Stops at the `--`
 * terminator so positional args after it are preserved verbatim.
 *
 * Mirrors `parseGlobalArgs`: refuses to consume the next arg as the value
 * when it looks like another flag, so commander gets a chance to surface a
 * usage error on a malformed `--user`.
 */
export function stripUserFlag(argv: string[]): string[] {
    const out: string[] = []
    let stopped = false
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (stopped) {
            out.push(arg)
            continue
        }
        if (arg === '--') {
            stopped = true
            out.push(arg)
            continue
        }
        if (arg === '--user') {
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
            continue
        }
        if (arg.startsWith('--user=')) {
            continue
        }
        out.push(arg)
    }
    return out
}
