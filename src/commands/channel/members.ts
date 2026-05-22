import type { Channel, Group, User, WorkspaceUser } from '@doist/twist-sdk'
import {
    addUsersToChannel,
    getCurrentWorkspaceId,
    getOptionalBatchData,
    getSessionUser,
    getTwistClient,
    getWorkspaceGroups,
    removeUsersFromChannel,
} from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions, ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson, pluralize, printDryRun } from '../../lib/output.js'
import { resolveChannelMemberRefs, resolveChannelRef } from '../../lib/refs.js'

type ChannelMutationOptions = MutationOptions

export type SyncOptions = MutationOptions & {
    apply?: boolean
    includeSelf?: boolean
}

function channelUserIds(channel: Channel): number[] {
    return channel.userIds ?? []
}

async function fetchUsersByIds(
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

function logExpansion(
    expandedFrom: { groupId: number; groupName: string; userIds: number[] }[],
): void {
    for (const g of expandedFrom) {
        console.log(
            colors.timestamp(
                `Expanded group "${g.groupName}" → ${g.userIds.length} ${pluralize(g.userIds.length, 'user')}`,
            ),
        )
    }
}

function describeExpansion(
    expandedFrom: { groupId: number; groupName: string; userIds: number[] }[],
): string | undefined {
    if (expandedFrom.length === 0) return undefined
    return expandedFrom
        .map((g) => `${g.groupName} (id:${g.groupId}, ${g.userIds.length} users)`)
        .join('\n')
}

async function mutateChannelMembership(
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

export async function addChannelMembers(
    channelRef: string,
    refs: string[],
    options: ChannelMutationOptions,
): Promise<void> {
    return mutateChannelMembership(channelRef, refs, 'add', options)
}

export async function removeChannelMembers(
    channelRef: string,
    refs: string[],
    options: ChannelMutationOptions,
): Promise<void> {
    return mutateChannelMembership(channelRef, refs, 'remove', options)
}

function groupsFullyInChannel(groups: Group[], channelUserIdSet: Set<number>): Group[] {
    return groups.filter(
        (g) => g.userIds.length > 0 && g.userIds.every((id) => channelUserIdSet.has(id)),
    )
}

export async function listChannelMembers(
    channelRef: string,
    options: ViewOptions & { full?: boolean },
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const [channel, groups] = await Promise.all([
        resolveChannelRef(channelRef, workspaceId),
        getWorkspaceGroups(workspaceId),
    ])
    const userIds = channelUserIds(channel)
    const userMap = await fetchUsersByIds(workspaceId, userIds)

    const userIdSet = new Set(userIds)
    const fullyInChannel = groupsFullyInChannel(groups, userIdSet)

    const members = userIds.map((id) => {
        const user = userMap.get(id)
        return { id, name: user?.name ?? null, email: user?.email ?? null }
    })

    const slimPayload = {
        id: channel.id,
        name: channel.name,
        workspaceId: channel.workspaceId,
        members,
        groupsFullyInChannel: fullyInChannel.map((g) => ({
            id: g.id,
            name: g.name,
            userIds: g.userIds,
        })),
    }
    const fullPayload = { ...channel, members, groupsFullyInChannel: fullyInChannel }

    if (options.json) {
        console.log(formatJson(options.full ? fullPayload : slimPayload))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson([options.full ? fullPayload : slimPayload]))
        return
    }

    console.log(colors.channel(channel.name))
    console.log(colors.timestamp(`id:${channel.id}`))
    console.log('')
    console.log(`${members.length} ${pluralize(members.length, 'member')}`)
    for (const m of members) {
        const name = m.name ?? `user:${m.id}`
        const email = m.email ? colors.timestamp(`<${m.email}>`) : ''
        const id = colors.timestamp(`id:${m.id}`)
        console.log(`  ${id}  ${colors.author(name)} ${email}`.trimEnd())
    }

    if (fullyInChannel.length > 0) {
        console.log('')
        console.log(`Groups fully in channel (${fullyInChannel.length}):`)
        for (const g of fullyInChannel) {
            console.log(
                `  ${colors.timestamp(`id:${g.id}`)}  ${g.name}  ${colors.timestamp(`(${g.userIds.length} ${pluralize(g.userIds.length, 'member')})`)}`,
            )
        }
    }
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
