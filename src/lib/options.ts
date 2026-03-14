export type ViewOptions = {
    json?: boolean
    ndjson?: boolean
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
