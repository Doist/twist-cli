import { getTwistClient } from '../../lib/api.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import { conversationLabel, type MuteOptions, parseMinutes } from './helpers.js'

export async function muteConversation(ref: string, options: MuteOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)
    const minutes = parseMinutes(options.minutes)

    const client = await getTwistClient()
    const conversation = await client.conversations.getConversation(conversationId)

    if (options.dryRun) {
        printDryRun('mute conversation', {
            Conversation: conversationLabel(conversation),
            Duration: `${minutes} minutes`,
            'Currently muted until': conversation.mutedUntil?.toISOString(),
        })
        return
    }

    const updated = await client.conversations.muteConversation({ id: conversationId, minutes })

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'conversation', true))
        } else {
            console.log(formatJson({ id: updated.id, mutedUntil: updated.mutedUntil }))
        }
        return
    }

    console.log(`Conversation ${conversationId} muted for ${minutes} minutes.`)
}
