import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
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
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument or pipe via stdin.',
        )
    }

    if (options.dryRun) {
        const preview = newContent.length > 200 ? `${newContent.slice(0, 200)}...` : newContent
        printDryRun('update message', {
            Message: String(messageId),
            Content: preview,
        })
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
