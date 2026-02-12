import { Command } from 'commander'
import { getCurrentWorkspaceId, getTwistClient } from '../lib/api.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { includePrivateChannels } from '../lib/public-channels.js'
import { resolveWorkspaceRef } from '../lib/refs.js'

interface ChannelsOptions {
    workspace?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

async function listChannels(
    workspaceRef: string | undefined,
    options: ChannelsOptions,
): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new Error('Cannot specify workspace both as argument and --workspace flag')
    }

    let workspaceId: number
    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const client = await getTwistClient()
    let channels = await client.channels.getChannels({ workspaceId })

    if (!includePrivateChannels()) {
        channels = channels.filter((ch) => ch.public)
    }

    if (channels.length === 0) {
        console.log('No channels found.')
        return
    }

    if (options.json) {
        console.log(formatJson(channels, 'channel', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(channels, 'channel', options.full))
        return
    }

    for (const ch of channels) {
        const id = colors.timestamp(`id:${ch.id}`)
        const name = colors.channel(ch.name)
        const archived = ch.archived ? colors.timestamp(' (archived)') : ''
        const visibility = ch.public ? '' : colors.timestamp(' [private]')
        console.log(`${id}  ${name}${visibility}${archived}`)
    }
}

export function registerChannelCommand(program: Command): void {
    program
        .command('channels [workspace-ref]')
        .description('List channels in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listChannels)
}
