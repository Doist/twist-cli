import { archiveChannel, getCurrentWorkspaceId, unarchiveChannel } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveChannelRef, resolveWorkspaceRef } from '../../lib/refs.js'

type ArchiveChannelOptions = MutationOptions & { workspace?: string }

async function setArchiveState(
    ref: string,
    options: ArchiveChannelOptions,
    archive: boolean,
): Promise<void> {
    const action = archive ? 'archive' : 'unarchive'
    const workspaceId = options.workspace
        ? (await resolveWorkspaceRef(options.workspace)).id
        : await getCurrentWorkspaceId()
    const channel = await resolveChannelRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun(`${action} channel`, {
            Channel: `${channel.name} (id:${channel.id})`,
            'Currently archived': channel.archived ? 'yes' : 'no',
        })
        return
    }

    if (channel.archived !== archive) {
        if (archive) {
            await archiveChannel(channel.id)
        } else {
            await unarchiveChannel(channel.id)
        }
    }

    if (options.json) {
        console.log(formatJson({ id: channel.id, archived: archive }))
        return
    }

    const verb = archive ? 'archived' : 'unarchived'
    const noop = channel.archived === archive ? ' (already in target state)' : ''
    console.log(`Channel "${channel.name}" (id:${channel.id}) ${verb}${noop}.`)
}

export async function archiveChannelCommand(
    ref: string,
    options: ArchiveChannelOptions,
): Promise<void> {
    await setArchiveState(ref, options, true)
}

export async function unarchiveChannelCommand(
    ref: string,
    options: ArchiveChannelOptions,
): Promise<void> {
    await setArchiveState(ref, options, false)
}
