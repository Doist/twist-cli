import chalk from 'chalk'
import { Command } from 'commander'
import { fetchWorkspaces, getCurrentWorkspaceId } from '../lib/api.js'
import { updateConfig } from '../lib/config.js'
import type { ViewOptions } from '../lib/options.js'
import { colors, formatJson, formatNdjson, printEmpty } from '../lib/output.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

type ListOptions = ViewOptions

async function listWorkspaces(options: ListOptions): Promise<void> {
    const workspaces = await fetchWorkspaces()

    if (workspaces.length === 0) {
        printEmpty({ options, type: 'workspace', message: 'No workspaces found.' })
        return
    }

    if (options.json) {
        console.log(formatJson(workspaces, 'workspace', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(workspaces, 'workspace', options.full))
        return
    }

    const currentWorkspaceId = await getCurrentWorkspaceId().catch(() => null)

    for (const w of workspaces) {
        const id = colors.timestamp(`id:${w.id}`)
        const name = w.id === currentWorkspaceId ? chalk.bold(w.name) : w.name
        const current = w.id === currentWorkspaceId ? chalk.green(' (current)') : ''
        const plan = w.plan ? colors.channel(`[${w.plan}]`) : ''
        console.log(`${id}  ${name}${current} ${plan}`)
    }
}

async function useWorkspace(ref: string): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    await updateConfig({ currentWorkspace: workspace.id })
    console.log(`Switched to workspace: ${workspace.name}`)
}

export function registerWorkspaceCommand(program: Command): void {
    program
        .command('workspaces')
        .description('List all workspaces')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw workspaces
  tw workspaces --json`,
        )
        .action(listWorkspaces)

    const workspace = program.command('workspace').description('Manage workspace')

    workspace
        .command('use <workspace-ref>')
        .description('Set the current workspace')
        .addHelpText(
            'after',
            `
Examples:
  tw workspace use "My Workspace"
  tw workspace use id:1585`,
        )
        .action(useWorkspace)
}
