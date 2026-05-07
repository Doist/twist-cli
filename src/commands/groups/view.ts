import { getCurrentWorkspaceId, getTwistClient } from '../../lib/api.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson, pluralize } from '../../lib/output.js'
import { resolveGroupRef } from '../../lib/refs.js'

type GroupViewOptions = ViewOptions & { full?: boolean }

export async function viewGroup(ref: string, options: GroupViewOptions): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const group = await resolveGroupRef(ref, workspaceId)

    // Batch-fetch only the users in this group, not the entire workspace
    const client = await getTwistClient()
    const userCalls = group.userIds.map((userId) =>
        client.workspaceUsers.getUserById({ workspaceId, userId }, { batch: true }),
    )
    const userResponses = group.userIds.length > 0 ? await client.batch(...userCalls) : []

    const members = group.userIds.map((id, i) => {
        const user = userResponses[i]?.data
        return {
            id,
            name: user?.name ?? null,
            email: user?.email ?? null,
        }
    })

    if (options.json) {
        if (options.full) {
            console.log(formatJson({ ...group, members }))
        } else {
            console.log(
                formatJson({
                    id: group.id,
                    name: group.name,
                    workspaceId: group.workspaceId,
                    members,
                }),
            )
        }
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson([{ ...group, members }]))
        return
    }

    console.log(colors.channel(group.name))
    console.log(colors.timestamp(`id:${group.id}`))
    console.log('')
    console.log(`${members.length} ${pluralize(members.length, 'member')}`)
    if (members.length === 0) return

    for (const m of members) {
        const name = m.name ?? `user:${m.id}`
        const email = m.email ? colors.timestamp(`<${m.email}>`) : ''
        const id = colors.timestamp(`id:${m.id}`)
        console.log(`  ${id}  ${colors.author(name)} ${email}`.trimEnd())
    }
}
