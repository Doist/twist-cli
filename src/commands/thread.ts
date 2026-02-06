import { getFullTwistURL, TwistApi } from '@doist/twist-sdk'
import chalk from 'chalk'
import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { openEditor, readStdin } from '../lib/input.js'
import { renderMarkdown } from '../lib/markdown.js'
import { colors, formatJson } from '../lib/output.js'
import { extractId, parseRef, resolveThreadId } from '../lib/refs.js'

interface ViewOptions {
    comment?: string
    limit?: string
    since?: string
    until?: string
    raw?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    unread?: boolean
    context?: string
}

interface ReplyOptions {
    dryRun?: boolean
    notify?: string
}

interface DoneOptions {
    dryRun?: boolean
}

function printSeparator(label: string): void {
    const totalWidth = 60
    const labelWithPadding = ` ${label} `
    const remainingWidth = totalWidth - labelWithPadding.length
    const leftWidth = Math.floor(remainingWidth / 2)
    const rightWidth = remainingWidth - leftWidth
    const line = chalk.dim('─'.repeat(leftWidth) + labelWithPadding + '─'.repeat(rightWidth))
    console.log('')
    console.log(line)
    console.log('')
}

function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`
}

interface CommentLike {
    id: number
    creator: number
    posted: Date
    content: string
}

function printComment(comment: CommentLike, userMap: Map<number, string>, raw: boolean): void {
    const author = colors.author(userMap.get(comment.creator) || `user:${comment.creator}`)
    const time = colors.timestamp(formatRelativeDate(comment.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${comment.id}`)}`)
    console.log(raw ? comment.content : renderMarkdown(comment.content))
    console.log('')
}

async function viewSingleComment(
    client: TwistApi,
    threadId: number,
    commentId: number,
    options: ViewOptions,
): Promise<void> {
    const [threadResponse, commentResponse] = await client.batch(
        client.threads.getThread(threadId, { batch: true }),
        client.comments.getComment(commentId, { batch: true }),
    )

    const thread = threadResponse.data
    const comment = commentResponse.data

    const userIds = new Set([thread.creator, comment.creator])
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

    const url = getFullTwistURL({
        workspaceId: thread.workspaceId,
        channelId: thread.channelId,
        threadId: thread.id,
        commentId: comment.id,
    })

    if (options.json) {
        const output = {
            ...comment,
            creatorName: userMap.get(comment.creator),
            channelName: channel.name,
            threadTitle: thread.title,
            url,
        }
        console.log(formatJson(output, undefined, options.full))
        return
    }

    if (options.ndjson) {
        console.log(
            JSON.stringify({
                type: 'comment',
                ...comment,
                creatorName: userMap.get(comment.creator),
                url,
            }),
        )
        return
    }

    console.log(chalk.bold(thread.title))
    console.log(colors.channel(`[${channel.name}]`))
    console.log('')
    printComment(comment, userMap, options.raw ?? false)
}

async function viewThread(ref: string, options: ViewOptions): Promise<void> {
    const parsed = parseRef(ref)
    const threadId = resolveThreadId(ref)
    const urlCommentId = parsed.type === 'url' ? parsed.parsed.commentId : undefined
    let commentId: number | undefined
    if (options.comment !== undefined) {
        commentId = extractId(options.comment)
    } else {
        commentId = urlCommentId
    }
    const client = await getTwistClient()

    if (commentId !== undefined) {
        return viewSingleComment(client, threadId, commentId, options)
    }

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

    let lastReadObjIndex: number | null = null
    if (options.unread) {
        const unreadData = await client.threads.getUnread(thread.workspaceId)
        const threadUnread = unreadData.find((u) => u.threadId === threadId)
        if (!threadUnread) {
            console.log('No unread comments in this thread.')
            return
        }
        lastReadObjIndex = threadUnread.objIndex
    }

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
            console.log(
                JSON.stringify({ type: 'comment', ...c, creatorName: userMap.get(c.creator) }),
            )
        }
        return
    }

    console.log(chalk.bold(thread.title))
    console.log(colors.channel(`[${channel.name}]`))
    console.log('')

    if (options.unread && lastReadObjIndex !== null) {
        const contextSize = options.context ? parseInt(options.context, 10) : 0
        const unreadComments = comments.filter((c) => (c.objIndex ?? 0) > lastReadObjIndex)
        const contextComments = comments
            .filter((c) => (c.objIndex ?? 0) <= lastReadObjIndex)
            .sort((a, b) => (b.objIndex ?? 0) - (a.objIndex ?? 0))
            .slice(0, contextSize)
            .reverse()

        if (unreadComments.length === 0) {
            console.log('No unread comments.')
            return
        }

        const creatorName = userMap.get(thread.creator) || `user:${thread.creator}`
        console.log(
            `${colors.author(creatorName)}  ${colors.timestamp(formatRelativeDate(thread.posted))}  ${chalk.dim('(original post)')}`,
        )
        console.log('')
        console.log(options.raw ? thread.content : renderMarkdown(thread.content))

        if (contextComments.length > 0) {
            const firstContextIndex = contextComments[0].objIndex ?? 0
            const skippedCount = firstContextIndex - 1
            if (skippedCount > 0) {
                printSeparator(`${skippedCount} ${pluralize(skippedCount, 'comment')} skipped`)
            } else {
                console.log('')
            }
            for (const comment of contextComments) {
                printComment(comment, userMap, options.raw ?? false)
            }
        } else if (lastReadObjIndex > 0) {
            printSeparator(`${lastReadObjIndex} ${pluralize(lastReadObjIndex, 'comment')} skipped`)
        }

        printSeparator(`UNREAD (${unreadComments.length} new)`)

        for (const comment of unreadComments) {
            printComment(comment, userMap, options.raw ?? false)
        }
    } else {
        const creatorName = userMap.get(thread.creator) || `user:${thread.creator}`
        console.log(
            `${colors.author(creatorName)}  ${colors.timestamp(formatRelativeDate(thread.posted))}`,
        )
        console.log('')
        console.log(options.raw ? thread.content : renderMarkdown(thread.content))
        console.log('')

        if (comments.length > 0) {
            console.log(
                chalk.dim(`--- ${comments.length} ${pluralize(comments.length, 'comment')} ---`),
            )
            console.log('')

            for (const comment of comments) {
                printComment(comment, userMap, options.raw ?? false)
            }
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

    const notifyValue = options.notify ?? 'EVERYONE_IN_THREAD'
    let recipients: string | number[]
    if (notifyValue === 'EVERYONE' || notifyValue === 'EVERYONE_IN_THREAD') {
        recipients = notifyValue
    } else {
        recipients = notifyValue.split(',').map((id) => {
            const trimmed = id.trim()
            if (!/^\d+$/.test(trimmed)) {
                console.error(`Invalid user ID: ${trimmed}`)
                process.exit(1)
            }
            return Number(trimmed)
        })
    }

    if (options.dryRun) {
        console.log('Dry run: would post comment to thread', threadId)
        console.log(`Notify: ${Array.isArray(recipients) ? recipients.join(', ') : recipients}`)
        console.log('')
        console.log(replyContent)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    const comment = await client.comments.createComment({
        threadId,
        content: replyContent,
        recipients,
    } as Parameters<typeof client.comments.createComment>[0])

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
        .option('--comment <id>', 'Show only a specific comment')
        .option('--unread', 'Show only unread comments (with original post for context)')
        .option('--context <n>', 'Include N read comments before unread (use with --unread)')
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
        .option(
            '--notify <recipients>',
            'Notification recipients: EVERYONE, EVERYONE_IN_THREAD, or comma-separated user IDs (default: EVERYONE_IN_THREAD)',
        )
        .option('--dry-run', 'Show what would be posted without posting')
        .action(replyToThread)

    thread
        .command('done <thread-ref>')
        .description('Archive a thread (mark as done)')
        .option('--dry-run', 'Show what would happen without executing')
        .action(markThreadDone)
}
