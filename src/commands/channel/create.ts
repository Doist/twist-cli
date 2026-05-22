import { createChannel, getCurrentWorkspaceId } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

type CreateChannelOptions = MutationOptions & {
    workspace?: string
    description?: string
    private?: boolean
}

export async function createChannelCommand(
    name: string,
    options: CreateChannelOptions,
): Promise<void> {
    if (!name || name.trim() === '') {
        throw new CliError('INVALID_NAME', 'Channel name cannot be empty.')
    }

    const workspaceId = options.workspace
        ? (await resolveWorkspaceRef(options.workspace)).id
        : await getCurrentWorkspaceId()

    const isPublic = options.private ? false : true

    if (options.dryRun) {
        printDryRun('create channel', {
            Workspace: String(workspaceId),
            Name: name,
            Visibility: isPublic ? 'public' : 'private',
            Description: options.description,
        })
        return
    }

    const channel = await createChannel({
        workspaceId,
        name,
        description: options.description,
        public: isPublic,
    })

    if (options.json) {
        console.log(formatJson(channel, 'channel', options.full))
        return
    }

    const visibility = channel.public ? 'public' : 'private'
    console.log(`Channel "${channel.name}" (id:${channel.id}, ${visibility}) created.`)
}
