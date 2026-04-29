import { getFullTwistURL, type SearchResult } from '@doist/twist-sdk'
import { Command, Option } from 'commander'
import { getCurrentWorkspaceId } from './api.js'
import { withCaseInsensitiveChoices } from './completion.js'
import { formatRelativeDate } from './dates.js'
import { CliError } from './errors.js'
import { includePrivateChannels } from './global-args.js'
import type { PaginatedViewOptions } from './options.js'
import { colors, formatJson } from './output.js'
import { getPublicChannelIds } from './public-channels.js'
import {
    resolveChannelId,
    resolveConversationId,
    resolveUserRefs,
    resolveWorkspaceRef,
} from './refs.js'
import {
    extendedSearch,
    type ExtendedSearchParams,
    type ExtendedSearchResponse,
    type SearchType,
} from './search-api.js'

function resolveNumericRefs(
    refs: string | undefined,
    entityType: string,
    resolver: (ref: string) => number,
): number[] | undefined {
    if (!refs) return undefined
    return refs.split(',').map((raw) => {
        const ref = raw.trim()
        if (!ref) {
            throw new CliError(
                'INVALID_REF',
                `Invalid ${entityType} reference list: found empty value`,
            )
        }
        return resolver(ref)
    })
}

export type SharedSearchOptions = PaginatedViewOptions & {
    workspace?: string
    channel?: string
    author?: string
    to?: string
    type?: SearchType
    conversation?: string
    cursor?: string
    all?: boolean
}

type SearchRequestOptions = SharedSearchOptions & {
    query?: string
    title?: string
    mentionSelf?: boolean
}

interface SearchRunResult {
    workspaceId: number
    response: ExtendedSearchResponse
}

type SharedSearchOptionConfig = {
    addUniqueFilters?: (command: Command) => void
    limitDescription?: string
}

export function addSharedSearchOptions<T extends Command>(
    command: T,
    config: SharedSearchOptionConfig = {},
): T {
    const limitDescription = config.limitDescription ?? 'Max results (default: 50)'

    command
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--channel <channel-refs>', 'Filter by channels (comma-separated refs)')
        .option('--author <user-refs>', 'Filter by author (comma-separated refs)')
        .option('--to <user-refs>', 'Messages sent to user (comma-separated refs)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--type <type>', 'Filter: threads, messages, or all'),
                ['threads', 'messages', 'all'],
            ),
        )

    config.addUniqueFilters?.(command)

    return command
        .option('--conversation <refs>', 'Limit to conversations (comma-separated refs)')
        .option('--since <date>', 'Content from date')
        .option('--until <date>', 'Content until date')
        .option('--limit <n>', limitDescription)
        .option('--cursor <cursor>', 'Pagination cursor')
        .option('--all', 'Fetch all pages of results')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
}

async function resolveWorkspaceId(
    workspaceRef: string | undefined,
    workspaceOption: string | undefined,
): Promise<number> {
    if (workspaceRef && workspaceOption) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify workspace both as argument and --workspace flag',
        )
    }

    const ref = workspaceRef || workspaceOption
    if (!ref) {
        return getCurrentWorkspaceId()
    }

    const workspace = await resolveWorkspaceRef(ref)
    return workspace.id
}

async function buildSearchParams(
    workspaceId: number,
    options: SearchRequestOptions,
): Promise<ExtendedSearchParams> {
    const limit = options.limit ? parseInt(options.limit, 10) : 50

    const channelIds = resolveNumericRefs(options.channel, 'channel', resolveChannelId)
    const authorIds = options.author
        ? await resolveUserRefs(options.author, workspaceId)
        : undefined
    const toUserIds = options.to ? await resolveUserRefs(options.to, workspaceId) : undefined
    const conversationIds = resolveNumericRefs(
        options.conversation,
        'conversation',
        resolveConversationId,
    )

    return {
        workspaceId,
        query: options.query,
        title: options.title,
        type: options.type,
        channelIds,
        conversationIds,
        authorIds,
        toUserIds,
        mentionSelf: options.mentionSelf,
        dateFrom: options.since,
        dateTo: options.until,
        limit,
        cursor: options.cursor,
    }
}

async function fetchSearchPages(
    params: ExtendedSearchParams,
    all = false,
): Promise<ExtendedSearchResponse> {
    if (!all) {
        return extendedSearch(params)
    }

    const items: SearchResult[] = []
    let cursor = params.cursor
    let hasMore = false
    let isPlanRestricted = false

    do {
        const response = await extendedSearch({ ...params, cursor })
        items.push(...response.items)
        cursor = response.nextCursorMark
        hasMore = response.hasMore
        isPlanRestricted = isPlanRestricted || response.isPlanRestricted
    } while (hasMore && cursor)

    return {
        items,
        hasMore: false,
        isPlanRestricted,
    }
}

async function filterVisibleSearchResults(
    workspaceId: number,
    response: ExtendedSearchResponse,
): Promise<ExtendedSearchResponse> {
    if (includePrivateChannels()) {
        return response
    }

    const publicIds = await getPublicChannelIds(workspaceId)
    return {
        ...response,
        items: response.items.filter((item) => !item.channelId || publicIds.has(item.channelId)),
    }
}

export async function runSearch(
    workspaceRef: string | undefined,
    options: SearchRequestOptions,
): Promise<SearchRunResult> {
    const workspaceId = await resolveWorkspaceId(workspaceRef, options.workspace)
    const params = await buildSearchParams(workspaceId, options)
    const response = await fetchSearchPages(params, options.all)
    return {
        workspaceId,
        response: await filterVisibleSearchResults(workspaceId, response),
    }
}

function buildSearchResultUrl(
    workspaceId: number,
    result: {
        type: string
        threadId?: number | null
        channelId?: number | null
        conversationId?: number | null
        commentId?: number | null
    },
): string {
    if (result.type === 'thread' && result.threadId && result.channelId) {
        return getFullTwistURL({
            workspaceId,
            channelId: result.channelId,
            threadId: result.threadId,
        })
    }
    if (result.type === 'comment' && result.threadId && result.channelId && result.commentId) {
        return getFullTwistURL({
            workspaceId,
            channelId: result.channelId,
            threadId: result.threadId,
            commentId: result.commentId,
        })
    }
    if (result.type === 'message' && result.conversationId) {
        return getFullTwistURL({ workspaceId, conversationId: result.conversationId })
    }
    return `https://twist.com/a/${workspaceId}`
}

type SearchOutputOptions = Pick<SharedSearchOptions, 'all' | 'json' | 'ndjson' | 'full'>

export function printSearchResults(
    workspaceId: number,
    response: ExtendedSearchResponse,
    options: SearchOutputOptions,
): void {
    const resultsWithUrls = response.items.map((result) => ({
        ...result,
        url: buildSearchResultUrl(workspaceId, result),
    }))

    if (options.json) {
        console.log(
            formatJson(
                {
                    results: resultsWithUrls,
                    nextCursor: response.nextCursorMark || null,
                },
                undefined,
                options.full,
            ),
        )
        return
    }

    if (options.ndjson) {
        for (const result of resultsWithUrls) {
            console.log(JSON.stringify(result))
        }
        if (resultsWithUrls.length === 0 || response.nextCursorMark) {
            console.log(
                JSON.stringify({ _meta: true, nextCursor: response.nextCursorMark || null }),
            )
        }
        return
    }

    if (resultsWithUrls.length === 0) {
        if (!options.all && response.hasMore && response.nextCursorMark) {
            console.log('No public results on this page.')
            console.log(
                colors.timestamp(`More results available. Use --cursor ${response.nextCursorMark}`),
            )
        } else {
            console.log('No results found.')
        }
        return
    }

    for (const result of resultsWithUrls) {
        const type = colors.channel(`[${result.type}]`)
        const title = result.title || result.snippet.slice(0, 50)
        const time = colors.timestamp(formatRelativeDate(result.snippetLastUpdated))

        console.log(`${type} ${title}`)
        console.log(`  ${colors.timestamp(result.snippet.slice(0, 100))}`)
        console.log(`  ${time}  ${colors.url(result.url)}`)
        console.log('')
    }

    if (!options.all && response.hasMore) {
        console.log(
            colors.timestamp(`More results available. Use --cursor ${response.nextCursorMark}`),
        )
    }
}
