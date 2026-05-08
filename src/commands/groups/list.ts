import { getCurrentWorkspaceId, getWorkspaceGroups } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson, pluralize, printEmpty } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export type ListGroupsOptions = ViewOptions & { workspace?: string; search?: string }

export async function listGroups(
    workspaceRef: string | undefined,
    options: ListGroupsOptions,
): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify workspace both as argument and --workspace flag',
        )
    }

    let workspaceId: number
    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    let groups = await getWorkspaceGroups(workspaceId)

    if (options.search) {
        const query = options.search.toLowerCase()
        groups = groups.filter((g) => g.name.toLowerCase().includes(query))
    }

    if (groups.length === 0) {
        printEmpty({ options, type: 'group', message: 'No groups found.' })
        return
    }

    if (options.json) {
        console.log(formatJson(groups, 'group', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(groups, 'group', options.full))
        return
    }

    for (const g of groups) {
        const id = colors.timestamp(`id:${g.id}`)
        const name = colors.channel(g.name)
        const members = colors.timestamp(
            `(${g.userIds.length} ${pluralize(g.userIds.length, 'member')})`,
        )
        console.log(`${id}  ${name}  ${members}`)
    }
}
