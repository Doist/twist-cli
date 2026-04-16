import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

export async function renameThread(
    ref: string,
    title: string,
    options: MutationOptions,
): Promise<void> {
    const threadId = resolveThreadId(ref)

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    if (options.dryRun) {
        printDryRun('rename thread', {
            Thread: `${thread.title} (${threadId})`,
            'New title': title,
        })
        return
    }

    const updated = await client.threads.updateThread({ id: threadId, title })

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'thread', true))
        } else {
            console.log(formatJson({ id: updated.id, title: updated.title }))
        }
        return
    }

    console.log(`Thread ${threadId} renamed to "${updated.title}".`)
}
