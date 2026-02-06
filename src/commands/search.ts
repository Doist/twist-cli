import { getFullTwistURL } from '@doist/twist-sdk'
import { Command } from 'commander'
import { getCurrentWorkspaceId } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { colors, formatJson } from '../lib/output.js'
import { getPublicChannelIds, includePrivateChannels } from '../lib/public-channels.js'
import { resolveUserRefs, resolveWorkspaceRef } from '../lib/refs.js'
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

interface SearchOptions {
    workspace?: string
    channel?: string
    author?: string
    to?: string
    type?: SearchType
    titleOnly?: boolean
    conversation?: string
    mentionMe?: boolean
    since?: string
    until?: string
    limit?: string
    cursor?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

async function search(
    query: string,
    workspaceRef: string | undefined,
    options: SearchOptions,
): Promise<void> {
    let workspaceId: number

    if (workspaceRef) {
        const workspace = await resolveWorkspaceRef(workspaceRef)
        workspaceId = workspace.id
    } else if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const limit = options.limit ? parseInt(options.limit, 10) : 50

    const channelIds = options.channel
        ? options.channel.split(',').map((id) => parseInt(id.trim(), 10))
        : undefined

    const authorIds = await resolveUserRefsOrExit(options.author, workspaceId)
    const toUserIds = await resolveUserRefsOrExit(options.to, workspaceId)

    const conversationIds = options.conversation
        ? options.conversation.split(',').map((id) => parseInt(id.trim(), 10))
        : undefined

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
        .option('--channel <channel-refs>', 'Filter by channels (comma-separated IDs)')
        .option('--author <user-refs>', 'Filter by author (comma-separated IDs)')
        .option('--to <user-refs>', 'Messages sent TO user (comma-separated IDs)')
        .option('--type <type>', 'Filter: threads, messages, or all')
        .option('--title-only', 'Search in thread titles only')
        .option('--conversation <refs>', 'Limit to conversations (comma-separated IDs)')
        .option('--mention-me', 'Only results mentioning current user')
        .option('--since <date>', 'Content from date')
        .option('--until <date>', 'Content until date')
        .option('--limit <n>', 'Max results (default: 50)')
        .option('--cursor <cursor>', 'Pagination cursor')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(search)
}
