import { getTwistClient } from '../../lib/api.js'
import { formatJson } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import { type MuteOptions, parseMinutes } from './helpers.js'

export async function muteConversation(ref: string, options: MuteOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)
    const minutes = parseMinutes(options.minutes)

    if (options.dryRun) {
        console.log(`Dry run: would mute conversation ${conversationId} for ${minutes} minutes`)
        return
    }

    const client = await getTwistClient()
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
