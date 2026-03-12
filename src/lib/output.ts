import chalk from 'chalk'

export const colors = {
    author: chalk.cyan,
    timestamp: chalk.dim,
    channel: chalk.blue,
    unread: chalk.bold,
    url: chalk.dim,
    error: chalk.red,
}

const THREAD_ESSENTIAL_FIELDS = [
    'id',
    'title',
    'channelId',
    'workspaceId',
    'creator',
    'posted',
    'commentCount',
    'isArchived',
    'reactions',
] as const

const COMMENT_ESSENTIAL_FIELDS = [
    'id',
    'content',
    'creator',
    'threadId',
    'posted',
    'reactions',
] as const

const CONVERSATION_ESSENTIAL_FIELDS = [
    'id',
    'workspaceId',
    'userIds',
    'title',
    'messageCount',
    'lastActive',
    'archived',
] as const

const MESSAGE_ESSENTIAL_FIELDS = [
    'id',
    'content',
    'creator',
    'conversationId',
    'posted',
    'reactions',
] as const

const WORKSPACE_ESSENTIAL_FIELDS = ['id', 'name', 'creator', 'plan'] as const

const USER_ESSENTIAL_FIELDS = ['id', 'name', 'email', 'timezone', 'userType', 'awayMode'] as const

const CHANNEL_ESSENTIAL_FIELDS = ['id', 'name', 'workspaceId'] as const

export type EntityType =
    | 'thread'
    | 'comment'
    | 'conversation'
    | 'message'
    | 'workspace'
    | 'user'
    | 'channel'

function getEssentialFields(type: EntityType): readonly string[] {
    switch (type) {
        case 'thread':
            return THREAD_ESSENTIAL_FIELDS
        case 'comment':
            return COMMENT_ESSENTIAL_FIELDS
        case 'conversation':
            return CONVERSATION_ESSENTIAL_FIELDS
        case 'message':
            return MESSAGE_ESSENTIAL_FIELDS
        case 'workspace':
            return WORKSPACE_ESSENTIAL_FIELDS
        case 'user':
            return USER_ESSENTIAL_FIELDS
        case 'channel':
            return CHANNEL_ESSENTIAL_FIELDS
    }
}

function pickFields<T extends object>(item: T, fields: readonly string[]): Partial<T> {
    const result: Partial<T> = {}
    for (const field of fields) {
        if (field in item) {
            ;(result as Record<string, unknown>)[field] = (item as Record<string, unknown>)[field]
        }
    }
    return result
}

export function filterEntityFields<T extends object>(
    data: T,
    type: EntityType,
    full?: boolean,
): T | Partial<T>
export function filterEntityFields<T extends object>(
    data: T[],
    type: EntityType,
    full?: boolean,
): Array<T | Partial<T>>
export function filterEntityFields<T extends object>(
    data: T | T[],
    type: EntityType,
    full = false,
): T | Partial<T> | Array<T | Partial<T>> {
    if (full) {
        return data
    }

    const fields = getEssentialFields(type)
    if (Array.isArray(data)) {
        return data.map((item) => pickFields(item, fields))
    }

    return pickFields(data, fields)
}

export function formatJson<T extends object>(
    data: T | T[],
    type?: EntityType,
    full = false,
): string {
    if (full || !type) {
        return JSON.stringify(data, null, 2)
    }
    return JSON.stringify(filterEntityFields(data, type), null, 2)
}

export function formatNdjson<T extends object>(
    items: T[],
    type?: EntityType,
    full = false,
): string {
    if (full || !type) {
        return items.map((item) => JSON.stringify(item)).join('\n')
    }
    return filterEntityFields(items, type)
        .map((item) => JSON.stringify(item))
        .join('\n')
}

export interface PaginatedOutput<T> {
    results: T[]
    nextCursor: string | null
}

export function formatPaginatedJson<T extends object>(
    data: PaginatedOutput<T>,
    type?: EntityType,
    full = false,
): string {
    const results = type ? filterEntityFields(data.results, type, full) : data.results
    return JSON.stringify({ results, nextCursor: data.nextCursor }, null, 2)
}

export function formatPaginatedNdjson<T extends object>(
    data: PaginatedOutput<T>,
    type?: EntityType,
    full = false,
): string {
    const results = type ? filterEntityFields(data.results, type, full) : data.results
    const lines = results.map((item) => JSON.stringify(item))
    if (data.nextCursor) {
        lines.push(JSON.stringify({ _meta: true, nextCursor: data.nextCursor }))
    }
    return lines.join('\n')
}

export function formatError(message: string): string {
    return colors.error(message)
}

export function printError(message: string): void {
    console.error(formatError(message))
}

export function printJson<T extends object>(data: T | T[], type?: EntityType, full = false): void {
    console.log(formatJson(data, type, full))
}

export function printNdjson<T extends object>(items: T[], type?: EntityType, full = false): void {
    console.log(formatNdjson(items, type, full))
}

export function isAccessible(): boolean {
    return process.env.TW_ACCESSIBLE === '1' || process.argv.includes('--accessible')
}
