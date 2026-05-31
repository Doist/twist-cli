import chalk from 'chalk'
import { getTwistClient } from '../../lib/api.js'
import { uploadAttachments } from '../../lib/attachments.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import type { ReplyOptions } from './helpers.js'

export async function replyToConversation(
    ref: string,
    content: string | undefined,
    options: ReplyOptions,
): Promise<void> {
    const conversationId = resolveConversationId(ref)

    const files = options.file ?? []
    const hasFiles = files.length > 0

    let replyContent = await readStdin()
    if (!replyContent && content) {
        replyContent = content
    }
    // A file-only message is allowed: skip the editor prompt and the empty-content guard.
    if (!replyContent && !hasFiles) {
        replyContent = await openEditor()
    }
    if ((!replyContent || replyContent.trim() === '') && !hasFiles) {
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument, pipe via stdin, or attach a file.',
        )
    }
    const messageContent = replyContent ?? ''

    if (options.dryRun) {
        const preview =
            messageContent.length > 200 ? `${messageContent.slice(0, 200)}...` : messageContent
        printDryRun('send message to conversation', {
            Conversation: String(conversationId),
            Attach: hasFiles ? files.join(', ') : undefined,
            Content: preview || undefined,
        })
        return
    }

    const client = await getTwistClient()

    // Preflight the target before uploading so an invalid or forbidden
    // conversation fails fast instead of leaving an orphaned upload behind.
    if (hasFiles) {
        await client.conversations.getConversation(conversationId)
    }

    const attachments = hasFiles ? await uploadAttachments(files) : undefined
    const message = await client.conversationMessages.createMessage({
        conversationId,
        content: messageContent,
        attachments,
    })

    if (options.json) {
        console.log(formatJson(message, 'message', options.full))
        return
    }

    console.log(`Message sent: ${message.url}`)
    if (attachments && attachments.length > 0) {
        const names = attachments.map((a) => a.fileName ?? 'file').join(', ')
        console.log(chalk.dim(`Attached: ${names}`))
    }
}
