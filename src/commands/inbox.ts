import { Command } from 'commander'
import chalk from 'chalk'
import { getFullTwistURL } from '@doist/twist-sdk'
import { getTwistClient, getCurrentWorkspaceId } from '../lib/api.js'
import { resolveWorkspaceRef } from '../lib/refs.js'
import { formatJson, formatNdjson, colors } from '../lib/output.js'
import { formatRelativeDate } from '../lib/dates.js'

interface InboxOptions {
  workspace?: string
  unread?: boolean
  since?: string
  until?: string
  limit?: string
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

async function showInbox(workspaceRef: string | undefined, options: InboxOptions): Promise<void> {
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

  if (options.json) {
    const output = inboxThreads.map((t) => ({
      ...t,
      channelName: channelMap.get(t.channelId),
      url: getFullTwistURL({ workspaceId, channelId: t.channelId, threadId: t.id }),
    }))
    console.log(formatJson(output, 'thread', options.full))
    return
  }

  if (options.ndjson) {
    const output = inboxThreads.map((t) => ({
      ...t,
      channelName: channelMap.get(t.channelId),
      url: getFullTwistURL({ workspaceId, channelId: t.channelId, threadId: t.id }),
    }))
    console.log(formatNdjson(output, 'thread', options.full))
    return
  }

  for (const thread of inboxThreads) {
    const channelName = channelMap.get(thread.channelId) || `ch:${thread.channelId}`
    const title = thread.isUnread ? chalk.bold(thread.title) : thread.title
    const channel = colors.channel(`[${channelName}]`)
    const time = colors.timestamp(formatRelativeDate(thread.posted))
    const unreadBadge = thread.isUnread ? chalk.blue(' *') : ''

    console.log(`${title}${unreadBadge}`)
    console.log(`  ${channel}  ${time}  ${colors.timestamp(`id:${thread.id}`)}`)
    console.log(
      `  ${colors.url(getFullTwistURL({ workspaceId, channelId: thread.channelId, threadId: thread.id }))}`,
    )
    console.log('')
  }
}

export function registerInboxCommand(program: Command): void {
  program
    .command('inbox [workspace-ref]')
    .description('Show inbox threads')
    .option('--workspace <ref>', 'Workspace ID or name')
    .option('--unread', 'Only show unread threads')
    .option('--since <date>', 'Filter by date (ISO format)')
    .option('--until <date>', 'Filter by date')
    .option('--limit <n>', 'Max items (default: 50)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(showInbox)
}
