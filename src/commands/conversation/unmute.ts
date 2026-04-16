import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'

export async function unmuteConversation(ref: string, options: MutationOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    if (options.dryRun) {
        printDryRun('unmute conversation', {
            Conversation: String(conversationId),
        })
        return
    }

    const client = await getTwistClient()
    const updated = await client.conversations.unmuteConversation(conversationId)

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'conversation', true))
        } else {
            console.log(formatJson({ id: updated.id, mutedUntil: updated.mutedUntil ?? null }))
        }
        return
    }

    console.log(`Conversation ${conversationId} unmuted.`)
}
