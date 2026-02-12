import chalk from 'chalk'
import { Command } from 'commander'
import { getCurrentWorkspaceId, getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { getPublicChannelIds, includePrivateChannels } from '../lib/public-channels.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

interface InboxOptions {
    workspace?: string
    channel?: string
    unread?: boolean
    since?: string
    until?: string
    limit?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

async function showInbox(workspaceRef: string | undefined, options: InboxOptions): Promise<void> {
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

    const client = await getTwistClient()
    const limit = options.limit ? parseInt(options.limit, 10) : 50

    const [threads, unreadData] = await client.batch(
        client.inbox.getInbox(
            {
                workspaceId,
                since: options.since ? new Date(options.since) : undefined,
                until: options.until ? new Date(options.until) : undefined,
                limit,
            },
            { batch: true },
        ),
        client.threads.getUnread(workspaceId, { batch: true }),
    )

    const unreadThreadIds = new Set(unreadData.data.map((u) => u.threadId))
    let inboxThreads = threads.data.map((t) => ({
        ...t,
        isUnread: unreadThreadIds.has(t.id),
    }))

    if (options.unread) {
        inboxThreads = inboxThreads.filter((t) => t.isUnread)
    }

    if (inboxThreads.length === 0) {
        console.log('No threads in inbox.')
        return
    }

    const channelIds = [...new Set(inboxThreads.map((t) => t.channelId))]
    const channelCalls = channelIds.map((id) => client.channels.getChannel(id, { batch: true }))
    const channelResponses = await client.batch(...channelCalls)
    const channelMap = new Map(channelResponses.map((r) => [r.data.id, r.data.name]))

    if (!includePrivateChannels()) {
        const publicIds = await getPublicChannelIds(workspaceId)
        inboxThreads = inboxThreads.filter((t) => publicIds.has(t.channelId))

        if (inboxThreads.length === 0) {
            console.log('No threads in public channels.')
            return
        }
    }

    if (options.channel) {
        const filter = options.channel.toLowerCase()
        const matchingChannelIds = new Set(
            [...channelMap.entries()]
                .filter(([, name]) => name.toLowerCase().includes(filter))
                .map(([id]) => id),
        )
        inboxThreads = inboxThreads.filter((t) => matchingChannelIds.has(t.channelId))

        if (inboxThreads.length === 0) {
            console.log(`No threads in channels matching "${options.channel}".`)
            return
        }
    }

    // Group by channel, unreads first within each channel, then sort by date (newest first)
    const groupedByChannel = new Map<number, typeof inboxThreads>()
    for (const thread of inboxThreads) {
        const group = groupedByChannel.get(thread.channelId) || []
        group.push(thread)
        groupedByChannel.set(thread.channelId, group)
    }

    const sortByDate = (a: (typeof inboxThreads)[0], b: (typeof inboxThreads)[0]) =>
        new Date(b.posted).getTime() - new Date(a.posted).getTime()

    const sortedChannelGroups: typeof inboxThreads = []
    for (const [, threads] of groupedByChannel) {
        const unreads = threads.filter((t) => t.isUnread).sort(sortByDate)
        const reads = threads.filter((t) => !t.isUnread).sort(sortByDate)
        sortedChannelGroups.push(...unreads, ...reads)
    }

    if (options.json) {
        const output = sortedChannelGroups.map((t) => ({
            ...t,
            channelName: channelMap.get(t.channelId),
        }))
        console.log(formatJson(output, 'thread', options.full))
        return
    }

    if (options.ndjson) {
        const output = sortedChannelGroups.map((t) => ({
            ...t,
            channelName: channelMap.get(t.channelId),
        }))
        console.log(formatNdjson(output, 'thread', options.full))
        return
    }

    let currentChannelId: number | null = null
    for (const thread of sortedChannelGroups) {
        if (thread.channelId !== currentChannelId) {
            const channelName = channelMap.get(thread.channelId) || `ch:${thread.channelId}`
            if (currentChannelId !== null) console.log('')
            console.log(chalk.bold.blue(`[${channelName}]`))
            console.log('')
            currentChannelId = thread.channelId
        }

        const title = thread.isUnread ? chalk.bold(thread.title) : thread.title
        const time = colors.timestamp(formatRelativeDate(thread.posted))
        const unreadBadge = thread.isUnread ? chalk.blue(' *') : ''

        console.log(`  ${title}${unreadBadge}`)
        console.log(`    ${time}  ${colors.timestamp(`id:${thread.id}`)}`)
        console.log(`    ${colors.url(thread.url)}`)
        console.log('')
    }
}

export function registerInboxCommand(program: Command): void {
    program
        .command('inbox [workspace-ref]')
        .description('Show inbox threads')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--channel <filter>', 'Filter by channel name (fuzzy match)')
        .option('--unread', 'Only show unread threads')
        .option('--since <date>', 'Filter by date (ISO format)')
        .option('--until <date>', 'Filter by date')
        .option('--limit <n>', 'Max items (default: 50)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(showInbox)
}
