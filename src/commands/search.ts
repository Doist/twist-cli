import { Command } from 'commander'
import { getFullTwistURL } from '@doist/twist-sdk'
import { getTwistClient, getCurrentWorkspaceId } from '../lib/api.js'
import { resolveWorkspaceRef } from '../lib/refs.js'
import { formatJson, formatNdjson, colors } from '../lib/output.js'
import { formatRelativeDate } from '../lib/dates.js'

interface SearchOptions {
  workspace?: string
  channel?: string
  author?: string
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

  const client = await getTwistClient()
  const limit = options.limit ? parseInt(options.limit, 10) : 50

  const channelIds = options.channel
    ? options.channel.split(',').map((id) => parseInt(id.trim(), 10))
    : undefined

  const authorIds = options.author
    ? options.author.split(',').map((id) => parseInt(id.trim(), 10))
    : undefined

  const response = await client.search.search({
    workspaceId,
    query,
    channelIds,
    authorIds,
    dateFrom: options.since,
    dateTo: options.until,
    limit,
    cursor: options.cursor,
  })

  if (response.items.length === 0) {
    console.log('No results found.')
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
    console.log(colors.timestamp(`More results available. Use --cursor ${response.nextCursorMark}`))
  }
}

function buildSearchResultUrl(
  workspaceId: number,
  result: { type: string; threadId?: number | null; channelId?: number | null; conversationId?: number | null; commentId?: number | null },
): string {
  if (result.type === 'thread' && result.threadId && result.channelId) {
    return getFullTwistURL({ workspaceId, channelId: result.channelId, threadId: result.threadId })
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
