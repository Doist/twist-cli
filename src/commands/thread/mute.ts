import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

type MuteOptions = MutationOptions & {
    minutes?: string
}

function parseMinutes(value: string | undefined): number {
    if (!value) return 60
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new CliError(
            'INVALID_MINUTES',
            `Invalid --minutes value: ${value} (must be a positive integer)`,
        )
    }
    return parsed
}

export async function muteThread(ref: string, options: MuteOptions): Promise<void> {
    const threadId = resolveThreadId(ref)
    const minutes = parseMinutes(options.minutes)

    if (options.dryRun) {
        console.log(`Dry run: would mute thread ${threadId} for ${minutes} minutes`)
        return
    }

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    const updated = await client.threads.muteThread({ id: threadId, minutes })

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'thread', true))
        } else {
            console.log(formatJson({ id: updated.id, mutedUntil: updated.mutedUntil }))
        }
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
        if (options.full) {
            console.log(formatJson(updated, 'thread', true))
        } else {
            console.log(formatJson({ id: updated.id, mutedUntil: updated.mutedUntil ?? null }))
        }
        return
    }

    console.log(`Thread ${threadId} unmuted.`)
}
