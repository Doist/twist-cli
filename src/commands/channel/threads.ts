import type { ArchiveFilter, Thread } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getCurrentWorkspaceId, getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { CliError } from '../../lib/errors.js'
import { isAccessible } from '../../lib/global-args.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { colors } from '../../lib/output.js'
import { resolveChannelRef, resolveWorkspaceRef } from '../../lib/refs.js'
import { decodeCursor, encodeCursor } from './helpers.js'

type ChannelThreadsOptions = PaginatedViewOptions & {
    workspace?: string
    unread?: boolean
    archiveFilter?: ArchiveFilter
    cursor?: string
}

type DecoratedThread = Thread & { isUnread: boolean }

const THREAD_ESSENTIAL_FIELDS: readonly (keyof DecoratedThread | 'url')[] = [
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
] as const

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

function pickEssential(thread: DecoratedThread): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const field of THREAD_ESSENTIAL_FIELDS) {
        out[field] = (thread as unknown as Record<string, unknown>)[field]
    }
    return out
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

    let workspaceId: number
    const ref = workspaceRef || options.workspace
    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const channel = await resolveChannelRef(channelRef, workspaceId)
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

    if (options.since) {
        const since = new Date(options.since).getTime()
        threads = threads.filter((t) => new Date(t.lastUpdated).getTime() >= since)
    }

    if (options.until) {
        const until = new Date(options.until).getTime()
        threads = threads.filter((t) => new Date(t.lastUpdated).getTime() < until)
    }

    threads.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())

    const limitNum = options.limit ? parseInt(options.limit, 10) : 50
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 50
    const offset = decodeCursor(options.cursor)
    const page = threads.slice(offset, offset + limit)
    const nextCursor = offset + limit < threads.length ? encodeCursor(offset + limit) : null

    if (options.json) {
        const results = options.full ? page : page.map(pickEssential)
        console.log(JSON.stringify({ results, nextCursor }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const t of page) {
            console.log(JSON.stringify(options.full ? t : pickEssential(t)))
        }
        if (nextCursor) {
            console.log(JSON.stringify({ _meta: true, nextCursor }))
        }
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
