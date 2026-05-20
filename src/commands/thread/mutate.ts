import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type DoneOptions = MutationOptions & { yes?: boolean }

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

    if (!options.yes) {
        if (options.json) {
            throw new CliError(
                'MISSING_YES_FLAG',
                '--yes is required to execute archive in --json mode.',
            )
        }
        console.log(`Would archive: ${thread.title}`)
        console.log('Use --yes to confirm.')
        return
    }

    await client.inbox.archiveThread(threadId)

    if (options.json) {
        console.log(formatJson({ id: threadId, isArchived: true }))
        return
    }

    console.log(`Thread ${threadId} archived.`)
}
