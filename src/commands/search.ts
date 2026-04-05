import { getFullTwistURL } from '@doist/twist-sdk'
import { Command, Option } from 'commander'
import { getCurrentWorkspaceId } from '../lib/api.js'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import { formatRelativeDate } from '../lib/dates.js'
import type { PaginatedViewOptions } from '../lib/options.js'
import { colors, formatJson } from '../lib/output.js'
import { getPublicChannelIds, includePrivateChannels } from '../lib/public-channels.js'
import {
    resolveChannelId,
    resolveConversationId,
    resolveUserRefs,
    resolveWorkspaceRef,
} from '../lib/refs.js'
import { extendedSearch, type SearchType } from '../lib/search-api.js'

async function resolveUserRefsOrExit(
    refs: string | undefined,
    workspaceId: number,
): Promise<number[] | undefined> {
    if (!refs) return undefined
    try {
        return await resolveUserRefs(refs, workspaceId)
    } catch (e) {
        console.error((e as Error).message)
        process.exit(1)
    }
}

function resolveNumericRefsOrExit(
    refs: string | undefined,
    entityType: string,
    resolver: (ref: string) => number,
): number[] | undefined {
    if (!refs) return undefined
    try {
        return refs.split(',').map((raw) => {
            const ref = raw.trim()
            if (!ref) {
                throw new Error(`Invalid ${entityType} reference list: found empty value`)
            }
            return resolver(ref)
        })
    } catch (e) {
        console.error((e as Error).message)
        process.exit(1)
    }
}

type SearchOptions = PaginatedViewOptions & {
    workspace?: string
    channel?: string
    author?: string
    to?: string
    type?: SearchType
    titleOnly?: boolean
    conversation?: string
    mentionMe?: boolean
    cursor?: string
}

async function search(
    query: string,
    workspaceRef: string | undefined,
    options: SearchOptions,
): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new Error('Cannot specify workspace both as argument and --workspace flag')
    }

    let workspaceId: number
    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const limit = options.limit ? parseInt(options.limit, 10) : 50

    const channelIds = resolveNumericRefsOrExit(options.channel, 'channel', resolveChannelId)

    const authorIds = await resolveUserRefsOrExit(options.author, workspaceId)
    const toUserIds = await resolveUserRefsOrExit(options.to, workspaceId)

    const conversationIds = resolveNumericRefsOrExit(
        options.conversation,
        'conversation',
        resolveConversationId,
    )

    const response = await extendedSearch({
        workspaceId,
        query: options.titleOnly ? undefined : query,
        title: options.titleOnly ? query : undefined,
        type: options.type,
        channelIds,
        conversationIds,
        authorIds,
        toUserIds,
        mentionSelf: options.mentionMe,
        dateFrom: options.since,
        dateTo: options.until,
        limit,
        cursor: options.cursor,
    })

    if (!includePrivateChannels()) {
        const publicIds = await getPublicChannelIds(workspaceId)
        response.items = response.items.filter(
            (item) => !item.channelId || publicIds.has(item.channelId),
        )
    }

    if (response.items.length === 0) {
        if (response.hasMore && response.nextCursorMark) {
            console.log('No public results on this page.')
            console.log(
                colors.timestamp(`More results available. Use --cursor ${response.nextCursorMark}`),
            )
        } else {
            console.log('No results found.')
        }
        return
    }

    if (options.json) {
        const output = {
            results: response.items.map((r) => ({
                ...r,
                url: buildSearchResultUrl(workspaceId, r),
            })),
            nextCursor: response.nextCursorMark || null,
        }
        console.log(formatJson(output, undefined, options.full))
        return
    }

    if (options.ndjson) {
        for (const r of response.items) {
            console.log(JSON.stringify({ ...r, url: buildSearchResultUrl(workspaceId, r) }))
        }
        if (response.nextCursorMark) {
            console.log(JSON.stringify({ _meta: true, nextCursor: response.nextCursorMark }))
        }
        return
    }

    for (const result of response.items) {
        const type = colors.channel(`[${result.type}]`)
        const title = result.title || result.snippet.slice(0, 50)
        const time = colors.timestamp(formatRelativeDate(result.snippetLastUpdated))

        console.log(`${type} ${title}`)
        console.log(`  ${colors.timestamp(result.snippet.slice(0, 100))}`)
        console.log(`  ${time}  ${colors.url(buildSearchResultUrl(workspaceId, result))}`)
        console.log('')
    }

    if (response.hasMore) {
        console.log(
            colors.timestamp(`More results available. Use --cursor ${response.nextCursorMark}`),
        )
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

export function registerSearchCommand(program: Command): void {
    program
        .command('search <query> [workspace-ref]')
        .description('Search content across a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--channel <channel-refs>', 'Filter by channels (comma-separated refs)')
        .option('--author <user-refs>', 'Filter by author (comma-separated IDs)')
        .option('--to <user-refs>', 'Messages sent TO user (comma-separated IDs)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--type <type>', 'Filter: threads, messages, or all'),
                ['threads', 'messages', 'all'],
            ),
        )
        .option('--title-only', 'Search in thread titles only')
        .option('--conversation <refs>', 'Limit to conversations (comma-separated refs)')
        .option('--mention-me', 'Only results mentioning current user')
        .option('--since <date>', 'Content from date')
        .option('--until <date>', 'Content until date')
        .option('--limit <n>', 'Max results (default: 50)')
        .option('--cursor <cursor>', 'Pagination cursor')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw search "deployment issue"
  tw search "bug report" --type threads --channel id:12345
  tw search "API" --author id:5678 --since 2025-01-01 --json`,
        )
        .action(search)
}
