import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveConversationId } from '../../lib/refs.js'
import { conversationLabel, type DoneOptions } from './helpers.js'

export async function markConversationDone(ref: string, options: DoneOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    const client = await getTwistClient()

    if (options.dryRun) {
        const conversation = await client.conversations.getConversation(conversationId)
        printDryRun('archive conversation', {
            Conversation: conversationLabel(conversation),
            Status: conversation.archived ? 'already archived' : undefined,
        })
        return
    }

    if (!options.yes) {
        if (options.json) {
            throw new CliError(
                'MISSING_YES_FLAG',
                '--yes is required to execute archive in --json mode.',
            )
        }
        const conversation = await client.conversations.getConversation(conversationId)
        console.log(`Would archive: ${conversationLabel(conversation)}`)
        console.log('Use --yes to confirm.')
        return
    }

    await client.conversations.archiveConversation(conversationId)

    if (options.json) {
        console.log(formatJson({ id: conversationId, archived: true }))
        return
    }

    console.log(`Conversation ${conversationId} archived.`)
}
