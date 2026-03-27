import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, resolveThreadId } from '../../lib/refs.js'

type ReplyOptions = MutationOptions & {
    notify?: string
    close?: boolean
    reopen?: boolean
}

export async function replyToThread(
    ref: string,
    content: string | undefined,
    options: ReplyOptions,
): Promise<void> {
    const threadId = resolveThreadId(ref)

    if (options.close && options.reopen) {
        console.error('Cannot use --close and --reopen together.')
        process.exit(1)
    }

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
        recipients = parseUserIdRefs(notifyValue)
    }

    const action = options.close ? 'close' : options.reopen ? 'reopen' : undefined
    const actionLabel = action === 'close' ? 'close' : action === 'reopen' ? 'reopen' : undefined

    if (options.dryRun) {
        const actionSuffix = actionLabel ? ` and ${actionLabel} it` : ''
        console.log(`Dry run: would post comment to thread ${threadId}${actionSuffix}`)
        console.log(`Notify: ${Array.isArray(recipients) ? recipients.join(', ') : recipients}`)
        console.log('')
        console.log(replyContent)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    const comment =
        action === 'close'
            ? await client.threads.closeThread({
                  id: threadId,
                  content: replyContent,
                  recipients,
              } as Parameters<typeof client.threads.closeThread>[0])
            : action === 'reopen'
              ? await client.threads.reopenThread({
                    id: threadId,
                    content: replyContent,
                    recipients,
                } as Parameters<typeof client.threads.reopenThread>[0])
              : await client.comments.createComment({
                    threadId,
                    content: replyContent,
                    recipients,
                } as Parameters<typeof client.comments.createComment>[0])

    if (options.json) {
        console.log(formatJson(comment, 'comment', options.full))
        return
    }

    const suffix = actionLabel ? ` (thread ${actionLabel === 'close' ? 'closed' : 'reopened'})` : ''
    console.log(`Comment posted${suffix}: ${comment.url}`)
}
