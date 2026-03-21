import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, resolveThreadId } from '../../lib/refs.js'

type ReplyOptions = MutationOptions & {
    notify?: string
}

export async function replyToThread(
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
        recipients = parseUserIdRefs(notifyValue)
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
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)
    const comment = await client.comments.createComment({
        threadId,
        content: replyContent,
        recipients,
    } as Parameters<typeof client.comments.createComment>[0])

    if (options.json) {
        console.log(formatJson(comment, 'comment', options.full))
        return
    }

    console.log(`Comment posted: ${comment.url}`)
}
