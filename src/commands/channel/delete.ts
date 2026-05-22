import { deleteChannel, getCurrentWorkspaceId } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveChannelRef } from '../../lib/refs.js'

type DeleteChannelOptions = MutationOptions & { yes?: boolean }

function isForbidden(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'httpStatusCode' in error &&
        (error as { httpStatusCode: number }).httpStatusCode === 403
    )
}

export async function deleteChannelCommand(
    ref: string,
    options: DeleteChannelOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const channel = await resolveChannelRef(ref, workspaceId)

    if (options.dryRun) {
        printDryRun('delete channel', {
            Channel: `${channel.name} (id:${channel.id})`,
            Visibility: channel.public ? 'public' : 'private',
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
        console.log(`Would delete: ${channel.name} (id:${channel.id})`)
        console.log('Use --yes to confirm.')
        return
    }

    try {
        await deleteChannel(channel.id)
    } catch (error) {
        if (isForbidden(error)) {
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
