import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import { conversationLabel } from './helpers.js'

export async function unmuteConversation(ref: string, options: MutationOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    const client = await getTwistClient()

    if (options.dryRun) {
        const conversation = await client.conversations.getConversation(conversationId)
        printDryRun('unmute conversation', {
            Conversation: conversationLabel(conversation),
            'Currently muted until': conversation.mutedUntil?.toISOString() ?? 'not muted',
        })
        return
    }

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
