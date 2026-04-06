import { Command } from 'commander'
import { getCurrentWorkspaceId, getWorkspaceGroups } from '../lib/api.js'
import { CliError } from '../lib/errors.js'
import type { ViewOptions } from '../lib/options.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

type GroupsOptions = ViewOptions & { workspace?: string; search?: string }

async function listGroups(workspaceRef: string | undefined, options: GroupsOptions): Promise<void> {
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

    if (options.json) {
        console.log(formatJson(groups, 'group', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(groups, 'group', options.full))
        return
    }

    if (groups.length === 0) {
        console.log('No groups found.')
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
        .command('groups [workspace-ref]')
        .description('List groups in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--search <text>', 'Filter by name')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listGroups)
}
