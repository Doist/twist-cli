import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { resolveMessageId } from '../../lib/refs.js'

type UpdateOptions = MutationOptions

export async function updateMessage(
    ref: string,
    content: string | undefined,
    options: UpdateOptions,
): Promise<void> {
    const messageId = resolveMessageId(ref)

    let newContent = await readStdin()
    if (!newContent && content) {
        newContent = content
    }
    if (!newContent) {
        newContent = await openEditor()
    }
    if (!newContent || newContent.trim() === '') {
        console.error('No content provided.')
        process.exit(1)
    }

    if (options.dryRun) {
        console.log(`Dry run: would update message ${messageId}`)
        console.log('')
        console.log(newContent)
        return
    }

    const client = await getTwistClient()
    const message = await client.conversationMessages.updateMessage({
        id: messageId,
        content: newContent,
    })

    if (options.json) {
        console.log(formatJson(message, 'message', options.full))
        return
    }

    console.log(`Message updated: ${message.url}`)
}
