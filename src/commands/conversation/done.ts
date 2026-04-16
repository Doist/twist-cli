import { getTwistClient } from '../../lib/api.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import { conversationLabel, type DoneOptions } from './helpers.js'

export async function markConversationDone(ref: string, options: DoneOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    const client = await getTwistClient()
    const conversation = await client.conversations.getConversation(conversationId)

    if (options.dryRun) {
        printDryRun('archive conversation', {
            Conversation: conversationLabel(conversation),
            Status: conversation.archived ? 'already archived' : undefined,
        })
        return
    }

    await client.conversations.archiveConversation(conversationId)

    if (options.json) {
        console.log(formatJson({ id: conversationId, archived: true }))
        return
    }

    console.log(`Conversation ${conversationId} archived.`)
}
