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
