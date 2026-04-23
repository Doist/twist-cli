import type { ArchiveFilter, Thread } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getCurrentWorkspaceId, getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { CliError } from '../../lib/errors.js'
import { isAccessible } from '../../lib/global-args.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    colors,
    formatPaginatedJson,
    formatPaginatedNdjson,
    type PaginatedOutput,
} from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveChannelRef, resolveWorkspaceRef } from '../../lib/refs.js'
import { decodeCursor, encodeCursor } from './helpers.js'

type ChannelThreadsOptions = PaginatedViewOptions & {
    workspace?: string
    unread?: boolean
    archiveFilter?: ArchiveFilter
    cursor?: string
}

type DecoratedThread = Thread & { isUnread: boolean }

function archiveFilterToFlag(filter: ArchiveFilter | undefined): boolean | undefined {
    switch (filter ?? 'active') {
        case 'active':
            return false
        case 'archived':
            return true
        case 'all':
            return undefined
    }
}

function parseDateFilter(value: string, flag: string): number {
    const ts = new Date(value).getTime()
    if (Number.isNaN(ts)) {
        throw new CliError(
            'INVALID_DATE',
            `Invalid ${flag} value: "${value}". Use an ISO-8601 date (e.g. 2026-01-15 or 2026-01-15T09:00:00Z).`,
        )
    }
    return ts
}

export async function showChannelThreads(
    channelRef: string,
    workspaceRef: string | undefined,
    options: ChannelThreadsOptions,
): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify workspace both as argument and --workspace flag',
        )
    }

    const sinceTs = options.since ? parseDateFilter(options.since, '--since') : undefined
    const untilTs = options.until ? parseDateFilter(options.until, '--until') : undefined

    let workspaceId: number
    const ref = workspaceRef || options.workspace
    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const channel = await resolveChannelRef(channelRef, workspaceId)
    await assertChannelIsPublic(channel.id, workspaceId)

    const archived = archiveFilterToFlag(options.archiveFilter)
    const client = await getTwistClient()

    const [threadsResp, unreadResp] = await client.batch(
        client.threads.getThreads(
            archived === undefined
                ? { workspaceId, channelId: channel.id }
                : { workspaceId, channelId: channel.id, archived },
            { batch: true },
        ),
        client.threads.getUnread(workspaceId, { batch: true }),
    )

    const unreadThreadIds = new Set(unreadResp.data.map((u) => u.threadId))
    let threads: DecoratedThread[] = threadsResp.data.map((t) => ({
        ...t,
        isUnread: unreadThreadIds.has(t.id),
    }))

    if (options.unread) {
        threads = threads.filter((t) => t.isUnread)
    }

    if (sinceTs !== undefined) {
        threads = threads.filter((t) => new Date(t.lastUpdated).getTime() >= sinceTs)
    }

    if (untilTs !== undefined) {
        threads = threads.filter((t) => new Date(t.lastUpdated).getTime() < untilTs)
    }

    threads.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())

    const limitNum = options.limit ? parseInt(options.limit, 10) : 50
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 50
    const offset = decodeCursor(options.cursor)
    const page = threads.slice(offset, offset + limit)
    const nextCursor = offset + limit < threads.length ? encodeCursor(offset + limit) : null

    const paginated: PaginatedOutput<DecoratedThread> = { results: page, nextCursor }

    if (options.json) {
        console.log(formatPaginatedJson(paginated, 'thread', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatPaginatedNdjson(paginated, 'thread', options.full))
        return
    }

    if (page.length === 0) {
        console.log(`No threads in #${channel.name}.`)
        return
    }

    console.log(chalk.bold.blue(`[${channel.name}]`))
    console.log('')

    for (const thread of page) {
        const title = thread.isUnread ? chalk.bold(thread.title) : thread.title
        const time = colors.timestamp(formatRelativeDate(thread.lastUpdated))
        const unreadBadge = thread.isUnread ? chalk.blue(isAccessible() ? ' (unread)' : ' *') : ''

        console.log(`  ${title}${unreadBadge}`)
        console.log(`    ${time}  ${colors.timestamp(`id:${thread.id}`)}`)
        console.log(`    ${colors.url(thread.url)}`)
        console.log('')
    }

    if (nextCursor) {
        console.log(colors.timestamp(`More threads available. Use --cursor ${nextCursor}`))
    }
}
