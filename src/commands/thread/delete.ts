import { assertBatchData, getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type DeleteOptions = MutationOptions & { yes?: boolean }

export async function deleteThread(ref: string, options: DeleteOptions): Promise<void> {
    const threadId = resolveThreadId(ref)

    const client = await getTwistClient()
    const [threadResponse, userResponse] = await client.batch(
        client.threads.getThread(threadId, { batch: true }),
        client.users.getSessionUser({ batch: true }),
    )

    const thread = assertBatchData(threadResponse, 'thread')
    const user = assertBatchData(userResponse, 'user')

    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    if (thread.creator !== user.id) {
        console.error('You can only delete threads that you created.')
        process.exitCode = 1
        return
    }

    if (options.dryRun) {
        console.log(`Dry run: would delete thread ${threadId}`)
        return
    }

    if (!options.yes) {
        if (options.json) {
            console.error('Error: --yes is required to execute deletion in --json mode.')
            process.exitCode = 1
            return
        }
        console.log(`Would delete: ${thread.title}`)
        console.log('Use --yes to confirm.')
        return
    }

    await client.threads.deleteThread(threadId)

    if (options.json) {
        console.log(formatJson({ id: threadId, deleted: true }))
        return
    }

    console.log(`Thread ${thread.title} (${threadId}) deleted.`)
}
