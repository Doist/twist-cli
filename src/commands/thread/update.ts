import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type UpdateOptions = MutationOptions

export async function updateThread(
    ref: string,
    content: string | undefined,
    options: UpdateOptions,
): Promise<void> {
    const threadId = resolveThreadId(ref)

    let newContent = await readStdin()
    if (!newContent && content) {
        newContent = content
    }
    if (!newContent) {
        newContent = await openEditor()
    }
    if (!newContent || newContent.trim() === '') {
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument or pipe via stdin.',
        )
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    if (options.dryRun) {
        console.log(`Dry run: would update thread ${threadId}`)
        console.log('')
        console.log(newContent)
        return
    }

    const updated = await client.threads.updateThread({
        id: threadId,
        content: newContent,
    })

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'thread', true))
        } else {
            console.log(formatJson({ id: updated.id, content: updated.content }))
        }
        return
    }

    console.log(`Thread ${threadId} updated.`)
}
