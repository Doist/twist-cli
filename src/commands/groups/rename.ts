import { getCurrentWorkspaceId, updateGroup } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveGroupRef } from '../../lib/refs.js'

export async function renameGroup(
    ref: string,
    newName: string,
    options: MutationOptions,
): Promise<void> {
    if (!newName || newName.trim() === '') {
        throw new CliError('INVALID_NAME', 'Group name cannot be empty.')
    }

    const workspaceId = await getCurrentWorkspaceId()
    const group = await resolveGroupRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('rename group', {
            Group: `${group.name} (id:${group.id})`,
            'New name': newName,
        })
        return
    }

    const updated = await updateGroup({ id: group.id, name: newName })

    if (options.json) {
        if (options.full) {
            console.log(formatJson(updated, 'group', true))
        } else {
            console.log(formatJson({ id: updated.id, name: updated.name }))
        }
        return
    }

    console.log(`Group ${group.id} renamed to "${updated.name}".`)
}
