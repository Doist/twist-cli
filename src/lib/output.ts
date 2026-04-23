import chalk from 'chalk'
import type { CliError } from './errors.js'

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
    'lastUpdated',
    'commentCount',
    'isArchived',
    'isUnread',
    'url',
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

const GROUP_ESSENTIAL_FIELDS = ['id', 'name', 'workspaceId', 'userIds'] as const

export type EntityType =
    | 'thread'
    | 'comment'
    | 'conversation'
    | 'message'
    | 'workspace'
    | 'user'
    | 'channel'
    | 'group'

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
        case 'group':
            return GROUP_ESSENTIAL_FIELDS
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

export function formatError(error: CliError): string
export function formatError(message: string): string
export function formatError(messageOrError: string | CliError): string {
    if (typeof messageOrError === 'string') {
        return colors.error(messageOrError)
    }
    const color = messageOrError.type === 'info' ? chalk.yellow : chalk.red
    const lines =
        messageOrError.type === 'info'
            ? [messageOrError.message]
            : [`Error: ${messageOrError.code}`, messageOrError.message]
    if (messageOrError.hints && messageOrError.hints.length > 0) {
        lines.push('')
        for (const hint of messageOrError.hints) {
            lines.push(`  - ${hint}`)
        }
    }
    return color(lines.join('\n'))
}

export function formatErrorJson(error: CliError): string
export function formatErrorJson(code: string, message: string, hints?: string[]): string
export function formatErrorJson(
    codeOrError: string | CliError,
    message?: string,
    hints?: string[],
): string {
    if (typeof codeOrError === 'string') {
        return JSON.stringify({ error: { code: codeOrError, message, hints } })
    }
    return JSON.stringify({
        error: { code: codeOrError.code, message: codeOrError.message, hints: codeOrError.hints },
    })
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

export function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`
}

export function printDryRun(
    action: string,
    details: Record<string, string | undefined> = {},
): void {
    console.log(chalk.yellow(`[dry-run] Would ${action}:`))
    for (const [key, value] of Object.entries(details)) {
        if (value !== undefined) {
            const [firstLine, ...rest] = value.split('\n')
            console.log(`  ${key}: ${firstLine}`)
            for (const line of rest) {
                console.log(`    ${line}`)
            }
        }
    }
    console.log(chalk.dim('Run without --dry-run to execute.'))
}
