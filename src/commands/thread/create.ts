import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, resolveChannelId } from '../../lib/refs.js'

type CreateOptions = MutationOptions & {
    notify?: string
}

export async function createThread(
    channelRef: string,
    title: string,
    content: string | undefined,
    options: CreateOptions,
): Promise<void> {
    const channelId = resolveChannelId(channelRef)

    let threadContent = await readStdin()
    if (!threadContent && content) {
        threadContent = content
    }
    if (!threadContent) {
        threadContent = await openEditor()
    }
    if (!threadContent || threadContent.trim() === '') {
        console.error('Error: no content provided. Pass content as an argument or pipe via stdin.')
        process.exitCode = 1
        return
    }

    const recipients = options.notify ? parseUserIdRefs(options.notify) : undefined

    if (options.dryRun) {
        console.log('Dry run: would create thread in channel', channelId)
        console.log(`Title: ${title}`)
        if (recipients) {
            console.log(`Notify: ${recipients.join(', ')}`)
        }
        console.log('')
        console.log(threadContent)
        return
    }

    const client = await getTwistClient()
    const channel = await client.channels.getChannel(channelId)
    await assertChannelIsPublic(channelId, channel.workspaceId)
    const thread = await client.threads.createThread({
        channelId,
        title,
        content: threadContent,
        recipients,
    })

    if (options.json) {
        console.log(formatJson(thread, 'thread', options.full))
        return
    }

    console.log(`Thread created: ${thread.url}`)
}
