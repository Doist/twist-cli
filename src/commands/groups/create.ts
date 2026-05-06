import { createGroup, getCurrentWorkspaceId } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveUserRefs, resolveWorkspaceRef } from '../../lib/refs.js'

type CreateGroupOptions = MutationOptions & {
    workspace?: string
    users?: string
}

export async function createGroupCommand(name: string, options: CreateGroupOptions): Promise<void> {
    if (!name || name.trim() === '') {
        throw new CliError('INVALID_NAME', 'Group name cannot be empty.')
    }

    const workspaceId = options.workspace
        ? (await resolveWorkspaceRef(options.workspace)).id
        : await getCurrentWorkspaceId()

    const userIds = options.users ? await resolveUserRefs(options.users, workspaceId) : undefined

    if (options.dryRun) {
        printDryRun('create group', {
            Workspace: String(workspaceId),
            Name: name,
            Users: userIds && userIds.length > 0 ? userIds.join(', ') : undefined,
        })
        return
    }

    const group = await createGroup({ workspaceId, name, userIds })

    if (options.json) {
        console.log(formatJson(group, 'group', options.full))
        return
    }

    const memberSuffix = userIds && userIds.length > 0 ? ` with ${userIds.length} member(s)` : ''
    console.log(`Group "${group.name}" (id:${group.id}) created${memberSuffix}.`)
}
