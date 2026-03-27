import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type MuteOptions = MutationOptions & {
    minutes?: string
}

export async function muteThread(ref: string, options: MuteOptions): Promise<void> {
    const threadId = resolveThreadId(ref)
    const minutes = options.minutes ? parseInt(options.minutes, 10) : 60

    if (options.dryRun) {
        console.log(`Dry run: would mute thread ${threadId} for ${minutes} minutes`)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    const updated = await client.threads.muteThread({ id: threadId, minutes })

    if (options.json) {
        console.log(formatJson(updated, 'thread', options.full))
        return
    }

    console.log(`Thread ${threadId} muted for ${minutes} minutes.`)
}

export async function unmuteThread(ref: string, options: MutationOptions): Promise<void> {
    const threadId = resolveThreadId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would unmute thread ${threadId}`)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    const updated = await client.threads.unmuteThread(threadId)

    if (options.json) {
        console.log(formatJson(updated, 'thread', options.full))
        return
    }

    console.log(`Thread ${threadId} unmuted.`)
}
