import { assertBatchData, getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveMessageId } from '../../lib/refs.js'

type DeleteOptions = MutationOptions

export async function deleteMessage(ref: string, options: DeleteOptions): Promise<void> {
    const messageId = resolveMessageId(ref)

    const client = await getTwistClient()
    const [messageResponse, userResponse] = await client.batch(
        client.conversationMessages.getMessage(messageId, { batch: true }),
        client.users.getSessionUser({ batch: true }),
    )

    const message = assertBatchData(messageResponse, 'message')
    const user = assertBatchData(userResponse, 'user')

    if (message.creator !== user.id) {
        throw new CliError('NOT_CREATOR', 'You can only delete messages that you created.')
    }

    if (options.dryRun) {
        const preview =
            message.content.length > 200 ? `${message.content.slice(0, 200)}...` : message.content
        printDryRun('delete message', {
            Message: String(messageId),
            Conversation: String(message.conversationId),
            Content: preview,
        })
        return
    }

    await client.conversationMessages.deleteMessage(messageId)

    if (options.json) {
        console.log(formatJson({ id: messageId, deleted: true }))
        return
    }

    console.log(`Message ${messageId} deleted.`)
}
