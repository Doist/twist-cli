import {
    addUsersToGroup,
    getCurrentWorkspaceId,
    getGroup,
    removeUsersFromGroup,
} from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveGroupRef, resolveUserRefs } from '../../lib/refs.js'

function joinUserRefs(userRefs: string[]): string {
    if (userRefs.length === 0) {
        throw new CliError(
            'MISSING_USERS',
            'Provide at least one user reference (id:N, email, or name).',
        )
    }
    return userRefs.join(',')
}

function dedupe(ids: number[]): number[] {
    return [...new Set(ids)]
}

type MembershipAction = 'add' | 'remove'

async function mutateGroupMembership(
    groupRef: string,
    userRefs: string[],
    action: MembershipAction,
    options: MutationOptions,
): Promise<void> {
    const workspaceId = await getCurrentWorkspaceId()
    const [group, resolvedIds] = await Promise.all([
        resolveGroupRef(groupRef, workspaceId),
        resolveUserRefs(joinUserRefs(userRefs), workspaceId),
    ])
    const userIds = dedupe(resolvedIds)

    const currentMembers = new Set(group.userIds)
    const actionableIds =
        action === 'add'
            ? userIds.filter((id) => !currentMembers.has(id))
            : userIds.filter((id) => currentMembers.has(id))
    const skippedIds =
        action === 'add'
            ? userIds.filter((id) => currentMembers.has(id))
            : userIds.filter((id) => !currentMembers.has(id))

    const actionLabel = action === 'add' ? 'add users to' : 'remove users from'
    const skippedLabel = action === 'add' ? 'Already members' : 'Not members'

    if (options.dryRun) {
        printDryRun(`${actionLabel} group`, {
            Group: `${group.name} (id:${group.id})`,
            [`Users to ${action}`]: actionableIds.length > 0 ? actionableIds.join(', ') : '(none)',
            [skippedLabel]: skippedIds.length > 0 ? skippedIds.join(', ') : undefined,
        })
        return
    }

    if (actionableIds.length > 0) {
        if (action === 'add') {
            await addUsersToGroup(group.id, actionableIds)
        } else {
            await removeUsersFromGroup(group.id, actionableIds)
        }
    }

    // Compute the new member count locally instead of refetching
    const newMemberCount =
        action === 'add'
            ? group.userIds.length + actionableIds.length
            : group.userIds.length - actionableIds.length

    if (options.json) {
        if (options.full) {
            // For --full we need the actual updated group from the API
            const updated = await getGroup(group.id)
            console.log(formatJson(updated, 'group', true))
        } else {
            const result: Record<string, unknown> = { id: group.id, memberCount: newMemberCount }
            if (action === 'add') {
                result.added = actionableIds
                result.alreadyMembers = skippedIds
            } else {
                result.removed = actionableIds
                result.notMembers = skippedIds
            }
            console.log(formatJson(result))
        }
        return
    }

    const pastVerb = action === 'add' ? 'Added' : 'Removed'
    const noneMsg =
        action === 'add'
            ? `No new members added to "${group.name}" (already in group).`
            : `No members removed from "${group.name}" (none of the users were in group).`

    if (actionableIds.length === 0) {
        console.log(noneMsg)
    } else {
        console.log(
            `${pastVerb} ${actionableIds.length} user(s) ${action === 'add' ? 'to' : 'from'} "${group.name}" (now ${newMemberCount} members).`,
        )
    }
    if (skippedIds.length > 0) {
        console.log(`${skippedLabel}: ${skippedIds.join(', ')}`)
    }
}

export async function addUsersCommand(
    groupRef: string,
    userRefs: string[],
    options: MutationOptions,
): Promise<void> {
    return mutateGroupMembership(groupRef, userRefs, 'add', options)
}

export async function removeUsersCommand(
    groupRef: string,
    userRefs: string[],
    options: MutationOptions,
): Promise<void> {
    return mutateGroupMembership(groupRef, userRefs, 'remove', options)
}
