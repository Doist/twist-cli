import { Command } from 'commander'
import { getCurrentWorkspaceId, getWorkspaceGroups } from '../lib/api.js'
import type { ViewOptions } from '../lib/options.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

type GroupsOptions = ViewOptions & { workspace?: string }

async function listGroups(nameFilter: string | undefined, options: GroupsOptions): Promise<void> {
    let workspaceId: number
    if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    let groups = await getWorkspaceGroups(workspaceId)

    if (nameFilter) {
        const query = nameFilter.toLowerCase()
        groups = groups.filter((g) => g.name.toLowerCase().includes(query))
    }

    if (groups.length === 0) {
        console.log('No groups found.')
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
        const members = colors.timestamp(`(${g.userIds.length} members)`)
        console.log(`${id}  ${name}  ${members}`)
    }
}

export function registerGroupsCommand(program: Command): void {
    program
        .command('groups [name-filter]')
        .description('List groups in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listGroups)
}
