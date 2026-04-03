import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { resolveMessageId } from '../../lib/refs.js'

type DeleteOptions = MutationOptions

export async function deleteMessage(ref: string, options: DeleteOptions): Promise<void> {
    const messageId = resolveMessageId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would delete message ${messageId}`)
        return
    }

    const client = await getTwistClient()
    await client.conversationMessages.deleteMessage(messageId)

    if (options.json) {
        console.log(formatJson({ id: messageId, deleted: true }))
        return
    }

    console.log(`Message ${messageId} deleted.`)
}
