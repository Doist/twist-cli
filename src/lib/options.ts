import type { ViewOptions as CoreViewOptions } from '@doist/cli-core'

export type ViewOptions = CoreViewOptions & {
    full?: boolean
    raw?: boolean
}

export type PaginatedViewOptions = ViewOptions & {
    limit?: string
    since?: string
    until?: string
}

export type MutationOptions = {
    dryRun?: boolean
    json?: boolean
    full?: boolean
}

/**
 * Commander collector for repeatable options (e.g. `--file a --file b`).
 * Use with a `[]` default: `.option('--file <path>', '…', collect, [])`.
 */
export function collect(value: string, previous: string[]): string[] {
    return [...previous, value]
}
