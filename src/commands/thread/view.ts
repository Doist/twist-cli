import type { TwistApi } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { colors, formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { extractId, parseRef, resolveThreadId } from '../../lib/refs.js'
import { pluralize, printComment, printSeparator } from './helpers.js'

type ViewOptions = PaginatedViewOptions & {
    comment?: string
    unread?: boolean
    context?: string
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

    if (options.json) {
        const output = {
            ...comment,
            creatorName: userMap.get(comment.creator),
            channelName: channel.name,
            threadTitle: thread.title,
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
            }),
        )
        return
    }

    console.log(chalk.bold(thread.title))
    console.log(colors.channel(`[${channel.name}]`))
    console.log('')
    printComment(comment, userMap, options.raw ?? false)
}

export async function viewThread(ref: string, options: ViewOptions): Promise<void> {
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

    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

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
            },
            comments: comments.map((c) => ({
                ...c,
                creatorName: userMap.get(c.creator),
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
