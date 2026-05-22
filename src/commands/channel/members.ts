import { getCurrentWorkspaceId, getWorkspaceGroups } from '../../lib/api.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson, pluralize } from '../../lib/output.js'
import { resolveChannelRef } from '../../lib/refs.js'
import { channelUserIds, fetchUsersByIds, groupsFullyInChannel } from './membership-helpers.js'

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
