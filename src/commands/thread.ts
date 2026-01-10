import { Command } from 'commander'
import chalk from 'chalk'
import { getFullTwistURL } from '@doist/twist-sdk'
import { getTwistClient } from '../lib/api.js'
import { resolveThreadId } from '../lib/refs.js'
import { formatJson, formatNdjson, colors } from '../lib/output.js'
import { formatRelativeDate } from '../lib/dates.js'
import { readStdin, openEditor } from '../lib/input.js'

interface ViewOptions {
  limit?: string
  since?: string
  until?: string
  raw?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

interface ReplyOptions {
  dryRun?: boolean
}

interface DoneOptions {
  dryRun?: boolean
}

async function viewThread(ref: string, options: ViewOptions): Promise<void> {
  const threadId = resolveThreadId(ref)
  const client = await getTwistClient()
  const limit = options.limit ? parseInt(options.limit, 10) : 50

  const [threadResponse, commentsResponse] = await client.batch(
    client.threads.getThread(threadId, { batch: true }),
    client.comments.getComments(
      {
        threadId,
        from: options.since ? new Date(options.since) : undefined,
        limit,
      },
      { batch: true },
    ),
  )

  const thread = threadResponse.data
  const comments = commentsResponse.data

  const userIds = new Set<number>([thread.creator, ...comments.map((c) => c.creator)])
  const userCalls = [...userIds].map((id) =>
    client.workspaceUsers.getUserById(
      { workspaceId: thread.workspaceId, userId: id },
      { batch: true },
    ),
  )
  const [channelResponse, ...userResponses] = await client.batch(
    client.channels.getChannel(thread.channelId, { batch: true }),
    ...userCalls,
  )

  const channel = channelResponse.data
  const userMap = new Map(userResponses.map((r) => [r.data.id, r.data.name]))

  if (options.json) {
    const output = {
      thread: {
        ...thread,
        channelName: channel.name,
        creatorName: userMap.get(thread.creator),
        url: getFullTwistURL({
          workspaceId: thread.workspaceId,
          channelId: thread.channelId,
          threadId: thread.id,
        }),
      },
      comments: comments.map((c) => ({
        ...c,
        creatorName: userMap.get(c.creator),
        url: getFullTwistURL({
          workspaceId: thread.workspaceId,
          channelId: thread.channelId,
          threadId: thread.id,
          commentId: c.id,
        }),
      })),
    }
    console.log(formatJson(output, undefined, options.full))
    return
  }

  if (options.ndjson) {
    const threadOutput = {
      type: 'thread',
      ...thread,
      channelName: channel.name,
      creatorName: userMap.get(thread.creator),
    }
    console.log(JSON.stringify(threadOutput))
    for (const c of comments) {
      console.log(JSON.stringify({ type: 'comment', ...c, creatorName: userMap.get(c.creator) }))
    }
    return
  }

  console.log(chalk.bold(thread.title))
  console.log(colors.channel(`[${channel.name}]`))
  console.log('')
  console.log(`${colors.author(userMap.get(thread.creator) || `user:${thread.creator}`)}  ${colors.timestamp(formatRelativeDate(thread.posted))}`)
  console.log('')
  console.log(options.raw ? thread.content : thread.content)
  console.log('')

  if (comments.length > 0) {
    console.log(chalk.dim(`--- ${comments.length} comment${comments.length === 1 ? '' : 's'} ---`))
    console.log('')

    for (const comment of comments) {
      const author = colors.author(userMap.get(comment.creator) || `user:${comment.creator}`)
      const time = colors.timestamp(formatRelativeDate(comment.posted))
      console.log(`${author}  ${time}  ${colors.timestamp(`id:${comment.id}`)}`)
      console.log(options.raw ? comment.content : comment.content)
      console.log('')
    }
  }
}

async function replyToThread(
  ref: string,
  content: string | undefined,
  options: ReplyOptions,
): Promise<void> {
  const threadId = resolveThreadId(ref)

  let replyContent = await readStdin()
  if (!replyContent && content) {
    replyContent = content
  }
  if (!replyContent) {
    replyContent = await openEditor()
  }
  if (!replyContent || replyContent.trim() === '') {
    console.error('No content provided.')
    process.exit(1)
  }

  if (options.dryRun) {
    console.log('Dry run: would post comment to thread', threadId)
    console.log('')
    console.log(replyContent)
    return
  }

  const client = await getTwistClient()
  const thread = await client.threads.getThread(threadId)
  const comment = await client.comments.createComment({
    threadId,
    content: replyContent,
  })

  const url = getFullTwistURL({
    workspaceId: thread.workspaceId,
    channelId: thread.channelId,
    threadId,
    commentId: comment.id,
  })

  console.log(`Comment posted: ${url}`)
}

async function markThreadDone(ref: string, options: DoneOptions): Promise<void> {
  const threadId = resolveThreadId(ref)

  if (options.dryRun) {
    console.log(`Dry run: would archive thread ${threadId}`)
    return
  }

  const client = await getTwistClient()
  await client.inbox.archiveThread(threadId)
  console.log(`Thread ${threadId} archived.`)
}

export function registerThreadCommand(program: Command): void {
  const thread = program.command('thread').description('Thread operations')

  thread
    .command('view <thread-ref>')
    .description('Display a thread with its comments')
    .option('--limit <n>', 'Max comments to show (default: 50)')
    .option('--since <date>', 'Comments newer than')
    .option('--until <date>', 'Comments older than')
    .option('--raw', 'Show raw markdown instead of rendered')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(viewThread)

  thread
    .command('reply <thread-ref> [content]')
    .description('Post a comment to a thread')
    .option('--dry-run', 'Show what would be posted without posting')
    .action(replyToThread)

  thread
    .command('done <thread-ref>')
    .description('Archive a thread (mark as done)')
    .option('--dry-run', 'Show what would happen without executing')
    .action(markThreadDone)
}
