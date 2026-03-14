import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type DoneOptions = MutationOptions

export async function markThreadDone(ref: string, options: DoneOptions): Promise<void> {
    const threadId = resolveThreadId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would archive thread ${threadId}`)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)
    await client.inbox.archiveThread(threadId)

    if (options.json) {
        console.log(formatJson({ id: threadId, isArchived: true }))
        return
    }

    console.log(`Thread ${threadId} archived.`)
}
