import { TwistRequestError } from '@doist/twist-sdk'
import { deleteChannel, getCurrentWorkspaceId } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveChannelRef, resolveWorkspaceRef } from '../../lib/refs.js'

type DeleteChannelOptions = MutationOptions & { yes?: boolean; workspace?: string }

export async function deleteChannelCommand(
    ref: string,
    options: DeleteChannelOptions,
): Promise<void> {
    if (!options.yes && options.json && !options.dryRun) {
        throw new CliError(
            'MISSING_YES_FLAG',
            '--yes is required to execute deletion in --json mode.',
        )
    }

    const workspaceId = options.workspace
        ? (await resolveWorkspaceRef(options.workspace)).id
        : await getCurrentWorkspaceId()
    const channel = await resolveChannelRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('delete channel', {
            Channel: `${channel.name} (id:${channel.id})`,
            Visibility: channel.public ? 'public' : 'private',
        })
        return
    }

    if (!options.yes) {
        console.log(`Would delete: ${channel.name} (id:${channel.id})`)
        console.log('Use --yes to confirm.')
        return
    }

    try {
        await deleteChannel(channel.id)
    } catch (error) {
        if (error instanceof TwistRequestError && error.httpStatusCode === 403) {
            throw new CliError(
                'FORBIDDEN',
                `Twist refused to delete "${channel.name}" (id:${channel.id}): 403 Forbidden.`,
                [
                    'Channel deletion is typically restricted to workspace admins',
                    'Ask a workspace admin to delete it, or use the Twist web UI',
                ],
            )
        }
        throw error
    }

    if (options.json) {
        console.log(formatJson({ id: channel.id, deleted: true }))
        return
    }

    console.log(`Channel "${channel.name}" (id:${channel.id}) deleted.`)
}
