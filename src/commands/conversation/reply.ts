import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import { formatJson } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import type { ReplyOptions } from './helpers.js'

export async function replyToConversation(
    ref: string,
    content: string | undefined,
    options: ReplyOptions,
): Promise<void> {
    const conversationId = resolveConversationId(ref)

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
        console.log('Dry run: would send message to conversation', conversationId)
        console.log('')
        console.log(replyContent)
        return
    }

    const client = await getTwistClient()
    const message = await client.conversationMessages.createMessage({
        conversationId,
        content: replyContent,
    })

    if (options.json) {
        console.log(formatJson(message, 'message', options.full))
        return
    }

    console.log(`Message sent: ${message.url}`)
}
