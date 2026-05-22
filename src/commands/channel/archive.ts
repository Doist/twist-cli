import { archiveChannel, getCurrentWorkspaceId, unarchiveChannel } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveChannelRef } from '../../lib/refs.js'

type ArchiveChannelOptions = MutationOptions

export async function archiveChannelCommand(
    ref: string,
    options: ArchiveChannelOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const channel = await resolveChannelRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('archive channel', {
            Channel: `${channel.name} (id:${channel.id})`,
            'Currently archived': channel.archived ? 'yes' : 'no',
        })
        return
    }

    await archiveChannel(channel.id)

    if (options.json) {
        console.log(formatJson({ id: channel.id, archived: true }))
        return
    }

    console.log(`Channel "${channel.name}" (id:${channel.id}) archived.`)
}

export async function unarchiveChannelCommand(
    ref: string,
    options: ArchiveChannelOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const channel = await resolveChannelRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('unarchive channel', {
            Channel: `${channel.name} (id:${channel.id})`,
            'Currently archived': channel.archived ? 'yes' : 'no',
        })
        return
    }

    await unarchiveChannel(channel.id)

    if (options.json) {
        console.log(formatJson({ id: channel.id, archived: false }))
        return
    }

    console.log(`Channel "${channel.name}" (id:${channel.id}) unarchived.`)
}
