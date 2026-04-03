import { getTwistClient } from '../../lib/api.js'
import { formatJson } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import type { DoneOptions } from './helpers.js'

export async function markConversationDone(ref: string, options: DoneOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would archive conversation ${conversationId}`)
        return
    }

    const client = await getTwistClient()
    await client.conversations.archiveConversation(conversationId)

    if (options.json) {
        console.log(formatJson({ id: conversationId, archived: true }))
        return
    }

    console.log(`Conversation ${conversationId} archived.`)
}
