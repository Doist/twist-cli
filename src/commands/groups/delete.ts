import { deleteGroup, getCurrentWorkspaceId } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveGroupRef } from '../../lib/refs.js'

type DeleteGroupOptions = MutationOptions & { yes?: boolean }

export async function deleteGroupCommand(ref: string, options: DeleteGroupOptions): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const group = await resolveGroupRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('delete group', {
            Group: `${group.name} (id:${group.id})`,
            Members: `${group.userIds.length}`,
        })
        return
    }

    if (!options.yes) {
        if (options.json) {
            throw new CliError(
                'MISSING_YES_FLAG',
                '--yes is required to execute deletion in --json mode.',
            )
        }
        console.log(`Would delete: ${group.name} (id:${group.id}, ${group.userIds.length} members)`)
        console.log('Use --yes to confirm.')
        return
    }

    await deleteGroup(group.id)

    if (options.json) {
        console.log(formatJson({ id: group.id, deleted: true }))
        return
    }

    console.log(`Group "${group.name}" (id:${group.id}) deleted.`)
}
