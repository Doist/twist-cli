import type { Channel, Group, WorkspaceUser } from '@doist/twist-sdk'
import {
    addUsersToChannel,
    getCurrentWorkspaceId,
    getOptionalBatchData,
    getTwistClient,
    removeUsersFromChannel,
} from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { colors, formatJson, pluralize, printDryRun } from '../../lib/output.js'
import { resolveChannelMemberRefs, resolveChannelRef } from '../../lib/refs.js'

export type ChannelMutationOptions = MutationOptions

export type ExpandedGroup = { groupId: number; groupName: string; userIds: number[] }

export function channelUserIds(channel: Channel): number[] {
    return channel.userIds ?? []
}

export async function fetchUsersByIds(
    workspaceId: number,
    userIds: number[],
): Promise<Map<number, WorkspaceUser>> {
    if (userIds.length === 0) return new Map()
    const client = await getTwistClient()
    const calls = userIds.map((userId) =>
        client.workspaceUsers.getUserById({ workspaceId, userId }, { batch: true }),
    )
    const responses = await client.batch(...calls)
    const map = new Map<number, WorkspaceUser>()
    userIds.forEach((id, i) => {
        const user = getOptionalBatchData(responses[i], `user ${id}`)
        if (user) map.set(id, user)
    })
    return map
}

export function logExpansion(expandedFrom: ExpandedGroup[]): void {
    for (const g of expandedFrom) {
        console.log(
            colors.timestamp(
                `Expanded group "${g.groupName}" → ${g.userIds.length} ${pluralize(g.userIds.length, 'user')}`,
            ),
        )
    }
}

export function describeExpansion(expandedFrom: ExpandedGroup[]): string | undefined {
    if (expandedFrom.length === 0) return undefined
    return expandedFrom
        .map((g) => `${g.groupName} (id:${g.groupId}, ${g.userIds.length} users)`)
        .join('\n')
}

export function groupsFullyInChannel(groups: Group[], channelUserIdSet: Set<number>): Group[] {
    return groups.filter(
        (g) => g.userIds.length > 0 && g.userIds.every((id) => channelUserIdSet.has(id)),
    )
}

/**
 * Shared add/remove mutation flow. Resolves the channel and the requested refs
 * concurrently, diffs against current membership, then either previews
 * (`--dry-run`) or applies the mutation and prints / emits JSON.
 */
export async function mutateChannelMembership(
    channelRef: string,
    refs: string[],
    action: 'add' | 'remove',
    options: ChannelMutationOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const [channel, { userIds: requested, expandedFrom }] = await Promise.all([
        resolveChannelRef(channelRef, workspaceId),
        resolveChannelMemberRefs(refs, workspaceId),
    ])

    const current = new Set(channelUserIds(channel))
    const actionable =
        action === 'add'
            ? requested.filter((id) => !current.has(id))
            : requested.filter((id) => current.has(id))
    const skipped =
        action === 'add'
            ? requested.filter((id) => current.has(id))
            : requested.filter((id) => !current.has(id))

    const actionLabel = action === 'add' ? 'add users to' : 'remove users from'
    const skippedLabel = action === 'add' ? 'Already members' : 'Not members'

    if (options.dryRun) {
        printDryRun(`${actionLabel} channel`, {
            Channel: `${channel.name} (id:${channel.id})`,
            'Expanded from groups': describeExpansion(expandedFrom),
            [`Users to ${action}`]: actionable.length > 0 ? actionable.join(', ') : '(none)',
            [skippedLabel]: skipped.length > 0 ? skipped.join(', ') : undefined,
        })
        return
    }

    if (actionable.length > 0) {
        if (action === 'add') {
            await addUsersToChannel(channel.id, actionable)
        } else {
            await removeUsersFromChannel(channel.id, actionable)
        }
    }

    const newMemberCount =
        action === 'add'
            ? channelUserIds(channel).length + actionable.length
            : channelUserIds(channel).length - actionable.length

    if (options.json) {
        if (options.full) {
            const client = await getTwistClient()
            const updated = await client.channels.getChannel(channel.id)
            console.log(formatJson(updated, 'channel', true))
        } else {
            const result: Record<string, unknown> = {
                id: channel.id,
                memberCount: newMemberCount,
            }
            if (expandedFrom.length > 0) result.expandedFrom = expandedFrom
            if (action === 'add') {
                result.added = actionable
                result.alreadyMembers = skipped
            } else {
                result.removed = actionable
                result.notMembers = skipped
            }
            console.log(formatJson(result))
        }
        return
    }

    const pastVerb = action === 'add' ? 'Added' : 'Removed'
    const preposition = action === 'add' ? 'to' : 'from'
    const noneMsg =
        action === 'add'
            ? `No new members added to "${channel.name}" (already in channel).`
            : `No members removed from "${channel.name}" (none of the users were in channel).`

    logExpansion(expandedFrom)

    if (actionable.length === 0) {
        console.log(noneMsg)
    } else {
        console.log(
            `${pastVerb} ${actionable.length} ${pluralize(actionable.length, 'user')} ${preposition} "${channel.name}" (now ${newMemberCount} ${pluralize(newMemberCount, 'member')}).`,
        )
    }
    if (skipped.length > 0) {
        console.log(`${skippedLabel}: ${skipped.join(', ')}`)
    }
}
