import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type DoneOptions = MutationOptions

export async function markThreadDone(ref: string, options: DoneOptions): Promise<void> {
    const threadId = resolveThreadId(ref)

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    if (options.dryRun) {
        printDryRun('archive thread', {
            Thread: `${thread.title} (${threadId})`,
        })
        return
    }

    await client.inbox.archiveThread(threadId)

    if (options.json) {
        console.log(formatJson({ id: threadId, isArchived: true }))
        return
    }

    console.log(`Thread ${threadId} archived.`)
}
