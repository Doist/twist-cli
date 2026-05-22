import type { User } from '@doist/twist-sdk'
import {
    addUsersToChannel,
    getCurrentWorkspaceId,
    getSessionUser,
    getTwistClient,
    removeUsersFromChannel,
} from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, pluralize, printDryRun } from '../../lib/output.js'
import { resolveChannelMemberRefs, resolveChannelRef } from '../../lib/refs.js'
import { channelUserIds, describeExpansion, logExpansion } from './membership-helpers.js'

export type SyncOptions = MutationOptions & {
    apply?: boolean
    includeSelf?: boolean
}

export async function syncChannelMembers(
    channelRef: string,
    refs: string[],
    options: SyncOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const [channel, sessionUser, memberRefs] = await Promise.all([
        resolveChannelRef(channelRef, workspaceId),
        getSessionUser() as Promise<User>,
        resolveChannelMemberRefs(refs, workspaceId),
    ])
    const { userIds: targetIds, expandedFrom } = memberRefs
    const desired = new Set(targetIds)
    const current = new Set(channelUserIds(channel))

    const toAdd = [...desired].filter((id) => !current.has(id))
    const toRemoveAll = [...current].filter((id) => !desired.has(id))

    const selfId = sessionUser.id
    const wouldRemoveSelf = toRemoveAll.includes(selfId)
    if (wouldRemoveSelf && !options.includeSelf) {
        throw new CliError(
            'INVALID_VALUE',
            `Sync would remove you (id:${selfId}) from "${channel.name}".`,
            [
                'Pass --include-self to allow removing yourself, or include yourself in the ref list.',
            ],
        )
    }
    const toRemove =
        wouldRemoveSelf && !options.includeSelf
            ? toRemoveAll.filter((id) => id !== selfId)
            : toRemoveAll

    const isDryRun = options.dryRun || !options.apply

    if (isDryRun) {
        printDryRun(`sync channel membership`, {
            Channel: `${channel.name} (id:${channel.id})`,
            'Expanded from groups': describeExpansion(expandedFrom),
            'To add': toAdd.length > 0 ? toAdd.join(', ') : '(none)',
            'To remove': toRemove.length > 0 ? toRemove.join(', ') : '(none)',
            Note: options.apply ? undefined : 'sync is dry-run by default; pass --apply to mutate.',
        })
        return
    }

    await Promise.all([
        toAdd.length > 0 ? addUsersToChannel(channel.id, toAdd) : Promise.resolve(),
        toRemove.length > 0 ? removeUsersFromChannel(channel.id, toRemove) : Promise.resolve(),
    ])

    const newMemberCount = current.size + toAdd.length - toRemove.length

    if (options.json) {
        const result: Record<string, unknown> = {
            id: channel.id,
            memberCount: newMemberCount,
            added: toAdd,
            removed: toRemove,
        }
        if (expandedFrom.length > 0) result.expandedFrom = expandedFrom
        if (options.full) {
            const client = await getTwistClient()
            const updated = await client.channels.getChannel(channel.id)
            console.log(formatJson({ ...updated, ...result }, 'channel', true))
        } else {
            console.log(formatJson(result))
        }
        return
    }

    logExpansion(expandedFrom)
    console.log(
        `Synced "${channel.name}": +${toAdd.length} / -${toRemove.length} (now ${newMemberCount} ${pluralize(newMemberCount, 'member')}).`,
    )
    if (toAdd.length > 0) console.log(`  Added: ${toAdd.join(', ')}`)
    if (toRemove.length > 0) console.log(`  Removed: ${toRemove.join(', ')}`)
}
