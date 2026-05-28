import type { Channel, Group, Workspace } from '@doist/twist-sdk'
import { fetchWorkspaces, getGroup, getWorkspaceGroups, getTwistClient } from './api.js'
import { CliError, type ErrorCode } from './errors.js'

function normalizeRef(ref: string): string {
    return ref.trim()
}

export function isIdRef(ref: string): boolean {
    return normalizeRef(ref).startsWith('id:')
}

export function extractId(ref: string): number {
    const normalized = normalizeRef(ref)
    const idStr = isIdRef(normalized) ? normalized.slice(3).trim() : normalized
    if (!/^\d+$/.test(idStr)) {
        throw new CliError('INVALID_ID', `Invalid ID: ${ref}`)
    }
    return Number(idStr)
}

export function looksLikeRawId(ref: string): boolean {
    const normalized = normalizeRef(ref)
    if (!normalized || normalized.includes(' ')) return false
    return /^\d+$/.test(normalized) || (/[a-zA-Z]/.test(normalized) && /\d/.test(normalized))
}

export interface ParsedTwistUrl {
    workspaceId?: number
    channelId?: number
    threadId?: number
    commentId?: number
    conversationId?: number
    messageId?: number
}

export function parseTwistUrl(url: string): ParsedTwistUrl | null {
    try {
        const parsed = new URL(url)
        if (!parsed.hostname.includes('twist.com')) {
            return null
        }

        const path = parsed.pathname
        const result: ParsedTwistUrl = {}

        // Pattern: /a/{workspaceId}/ch/{channelId}/t/{threadId}/c/{commentId}
        // Pattern: /a/{workspaceId}/msg/{conversationId}/m/{messageId}
        const workspaceMatch = path.match(/\/a\/(\d+)/)
        if (workspaceMatch) {
            result.workspaceId = parseInt(workspaceMatch[1], 10)
        }

        const channelMatch = path.match(/\/ch\/(\d+)/)
        if (channelMatch) {
            result.channelId = parseInt(channelMatch[1], 10)
        }

        const threadMatch = path.match(/\/t\/(\d+)/)
        if (threadMatch) {
            result.threadId = parseInt(threadMatch[1], 10)
        }

        const commentMatch = path.match(/\/c\/(\d+)/)
        if (commentMatch) {
            result.commentId = parseInt(commentMatch[1], 10)
        }

        const conversationMatch = path.match(/\/msg\/(\d+)/)
        if (conversationMatch) {
            result.conversationId = parseInt(conversationMatch[1], 10)
        }

        const messageMatch = path.match(/\/m\/(\d+)/)
        if (messageMatch) {
            result.messageId = parseInt(messageMatch[1], 10)
        }

        return Object.keys(result).length > 0 ? result : null
    } catch {
        return null
    }
}

export function parseRef(
    ref: string,
):
    | { type: 'id'; id: number }
    | { type: 'url'; parsed: ParsedTwistUrl }
    | { type: 'name'; name: string } {
    const normalized = normalizeRef(ref)

    if (isIdRef(normalized)) {
        return { type: 'id', id: extractId(normalized) }
    }

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        const parsed = parseTwistUrl(normalized)
        if (parsed) {
            return { type: 'url', parsed }
        }
    }

    if (/^\d+$/.test(normalized)) {
        return { type: 'id', id: Number(normalized) }
    }

    return { type: 'name', name: normalized }
}

/**
 * Match an entity by name: exact (case-insensitive) → unique substring → ambiguous/not-found.
 */
function matchByName<T extends { id: number; name: string }>(
    items: T[],
    query: string,
    opts: {
        ambiguousCode: ErrorCode
        notFoundCode: ErrorCode
        ref: string
        listHint: string
    },
): T {
    const lower = query.toLowerCase()
    const exact = items.find((item) => item.name.toLowerCase() === lower)
    if (exact) return exact

    const partial = items.filter((item) => item.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        const matches = partial
            .slice(0, 5)
            .map((item) => `"${item.name}" (id:${item.id})`)
            .join(', ')
        throw new CliError(opts.ambiguousCode, `Multiple matches for "${opts.ref}": ${matches}`, [
            'Use the numeric ID (e.g. id:123) to specify exactly which one.',
        ])
    }

    throw new CliError(opts.notFoundCode, `"${opts.ref}" not found`, [opts.listHint])
}

export async function resolveWorkspaceRef(ref: string): Promise<Workspace> {
    const workspaces = await fetchWorkspaces()
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        const workspace = workspaces.find((w) => w.id === parsed.id)
        if (!workspace) {
            throw new CliError('WORKSPACE_NOT_FOUND', `Workspace with ID ${parsed.id} not found`, [
                'Run: tw workspaces to list available workspaces',
            ])
        }
        return workspace
    }

    if (parsed.type === 'url' && parsed.parsed.workspaceId) {
        const workspace = workspaces.find((w) => w.id === parsed.parsed.workspaceId)
        if (!workspace) {
            throw new CliError(
                'WORKSPACE_NOT_FOUND',
                `Workspace with ID ${parsed.parsed.workspaceId} not found`,
                ['Run: tw workspaces to list available workspaces'],
            )
        }
        return workspace
    }

    if (parsed.type === 'name') {
        return matchByName(workspaces, parsed.name, {
            ambiguousCode: 'AMBIGUOUS_WORKSPACE',
            notFoundCode: 'WORKSPACE_NOT_FOUND',
            ref,
            listHint: 'Run: tw workspaces to list available workspaces',
        })
    }

    throw new CliError('WORKSPACE_NOT_FOUND', `Workspace "${ref}" not found`, [
        'Run: tw workspaces to list available workspaces',
    ])
}

export function resolveThreadId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.threadId) {
        return parsed.parsed.threadId
    }

    throw new CliError(
        'INVALID_REF',
        `Invalid thread reference: ${ref}. Use 123, id:123, or a Twist URL.`,
    )
}

function assertChannelInWorkspace(channel: Channel, workspaceId: number): void {
    if (channel.workspaceId !== workspaceId) {
        throw new CliError(
            'CHANNEL_NOT_FOUND',
            `Channel ${channel.id} does not belong to workspace ${workspaceId}`,
        )
    }
}

export async function resolveChannelRef(ref: string, workspaceId: number): Promise<Channel> {
    const parsed = parseRef(ref)
    const client = await getTwistClient()

    if (parsed.type === 'id') {
        const channel = await client.channels.getChannel(parsed.id)
        assertChannelInWorkspace(channel, workspaceId)
        return channel
    }

    if (parsed.type === 'url' && parsed.parsed.channelId) {
        if (parsed.parsed.workspaceId && parsed.parsed.workspaceId !== workspaceId) {
            throw new CliError(
                'CHANNEL_NOT_FOUND',
                `Channel URL belongs to workspace ${parsed.parsed.workspaceId}, but the current workspace is ${workspaceId}`,
                ['Pass the matching workspace-ref or use the default workspace that owns the URL.'],
            )
        }
        const channel = await client.channels.getChannel(parsed.parsed.channelId)
        assertChannelInWorkspace(channel, workspaceId)
        return channel
    }

    if (parsed.type === 'name') {
        // getChannels is membership-scoped — it returns only channels the current user has
        // joined (across active + archived). Public channels the user hasn't joined are not
        // included, so name-resolving e.g. `tw channel archive "Old Public Channel"` would
        // fail with CHANNEL_NOT_FOUND even though the channel is discoverable. Merge with
        // getPublicChannels (workspace-scoped, returns all public channels regardless of
        // membership) and dedupe by id so a joined-and-public channel doesn't match twice.
        const [joined, publicChannels] = await Promise.all([
            client.channels.getChannels({ workspaceId }),
            client.workspaces.getPublicChannels(workspaceId),
        ])
        const joinedIds = new Set(joined.map((channel) => channel.id))
        const channels = [
            ...joined,
            ...publicChannels.filter((channel) => !joinedIds.has(channel.id)),
        ]
        return matchByName(channels, parsed.name, {
            ambiguousCode: 'AMBIGUOUS_CHANNEL',
            notFoundCode: 'CHANNEL_NOT_FOUND',
            ref,
            listHint: 'Run: tw channels to list available channels',
        })
    }

    throw new CliError('CHANNEL_NOT_FOUND', `Channel "${ref}" not found`, [
        'Run: tw channels to list available channels',
    ])
}

export function resolveChannelId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.channelId) {
        return parsed.parsed.channelId
    }

    throw new CliError(
        'INVALID_REF',
        `Invalid channel reference: ${ref}. Use 123, id:123, or a Twist URL.`,
    )
}

export function resolveCommentId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.commentId) {
        return parsed.parsed.commentId
    }

    throw new CliError(
        'INVALID_REF',
        `Invalid comment reference: ${ref}. Use 123, id:123, or a Twist URL.`,
    )
}

export function resolveConversationId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.conversationId) {
        return parsed.parsed.conversationId
    }

    throw new CliError(
        'INVALID_REF',
        `Invalid conversation reference: ${ref}. Use 123, id:123, or a Twist URL.`,
    )
}

export function resolveMessageId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.messageId) {
        return parsed.parsed.messageId
    }

    throw new CliError(
        'INVALID_REF',
        `Invalid message reference: ${ref}. Use 123, id:123, or a Twist URL.`,
    )
}

export type TwistUrlRoute = {
    entityType: 'message' | 'conversation' | 'comment' | 'thread'
    url: string
}

export function classifyTwistUrl(url: string): TwistUrlRoute | null {
    const parsed = parseTwistUrl(url)
    if (!parsed) return null

    if (parsed.messageId) return { entityType: 'message', url }
    if (parsed.conversationId && !parsed.messageId) return { entityType: 'conversation', url }
    if (parsed.commentId) return { entityType: 'comment', url }
    if (parsed.threadId && !parsed.commentId) return { entityType: 'thread', url }

    return null
}

export function partitionNotifyIds(
    ids: number[],
    groupIds: Set<number>,
): { userIds: number[]; groupIds: number[] } {
    const users: number[] = []
    const groups: number[] = []
    for (const id of ids) {
        if (groupIds.has(id)) {
            groups.push(id)
        } else {
            users.push(id)
        }
    }
    return { userIds: users, groupIds: groups }
}

export function parseUserIdRefs(refs: string): number[] {
    return refs.split(',').map((userRef) => {
        const trimmed = userRef.trim()
        if (!trimmed) {
            throw new CliError('INVALID_REF', 'Invalid user reference list: found empty value')
        }
        try {
            return extractId(trimmed)
        } catch {
            throw new CliError(
                'INVALID_REF',
                `Invalid user reference: ${trimmed}. Use 123 or id:123`,
            )
        }
    })
}

export async function resolveGroupRef(ref: string, workspaceId: number): Promise<Group> {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        try {
            const group = await getGroup(parsed.id)
            if (group.workspaceId !== workspaceId) {
                throw new CliError(
                    'GROUP_NOT_FOUND',
                    `Group ${parsed.id} does not belong to workspace ${workspaceId}`,
                )
            }
            return group
        } catch (error) {
            if (error instanceof CliError) throw error
            throw new CliError('GROUP_NOT_FOUND', `Group with ID ${parsed.id} not found`, [
                'Run: tw groups to list available groups',
            ])
        }
    }

    if (parsed.type === 'name') {
        const groups = await getWorkspaceGroups(workspaceId)
        return matchByName(groups, parsed.name, {
            ambiguousCode: 'AMBIGUOUS_GROUP',
            notFoundCode: 'GROUP_NOT_FOUND',
            ref,
            listHint: 'Run: tw groups to list available groups',
        })
    }

    throw new CliError('GROUP_NOT_FOUND', `Group "${ref}" not found`, [
        'Run: tw groups to list available groups',
    ])
}

export type ChannelMemberRefs = {
    userIds: number[]
    expandedFrom: { groupId: number; groupName: string; userIds: number[] }[]
}

const GROUP_REF_PREFIX = 'group:'

/**
 * Resolve a mixed list of user and `group:<ref>` references for channel membership.
 *
 * Groups are expanded to their current `userIds` at call time. The group itself
 * is not persistently linked to the channel — callers should surface that
 * caveat in user-facing help text.
 *
 * Returns deduped userIds in input order, with a parallel `expandedFrom` list
 * recording which groups contributed (and which users each group brought in,
 * pre-dedup) for reporting purposes.
 */
export async function resolveChannelMemberRefs(
    refs: string[],
    workspaceId: number,
): Promise<ChannelMemberRefs> {
    if (refs.length === 0) {
        throw new CliError('MISSING_USERS', 'Provide at least one user or group:<ref> reference.')
    }

    type Slot =
        | { kind: 'user'; ref: string; index: number }
        | { kind: 'group'; ref: string; index: number }
    const slots: Slot[] = refs.map((ref, index) => {
        const trimmed = normalizeRef(ref)
        if (trimmed.toLowerCase().startsWith(GROUP_REF_PREFIX)) {
            const inner = trimmed.slice(GROUP_REF_PREFIX.length).trim()
            if (!inner) {
                throw new CliError(
                    'INVALID_REF',
                    `Empty group reference: "${ref}". Use group:<id|name>.`,
                )
            }
            return { kind: 'group', ref: inner, index }
        }
        return { kind: 'user', ref: trimmed, index }
    })

    const userSlots = slots.filter((s): s is Extract<Slot, { kind: 'user' }> => s.kind === 'user')
    const groupSlots = slots.filter(
        (s): s is Extract<Slot, { kind: 'group' }> => s.kind === 'group',
    )

    // Resolve users (one batched API call) and all groups concurrently.
    const [userIdsResolved, groupsResolved] = await Promise.all([
        userSlots.length > 0
            ? resolveUserRefs(userSlots.map((s) => s.ref).join(','), workspaceId)
            : Promise.resolve([] as number[]),
        Promise.all(groupSlots.map((s) => resolveGroupRef(s.ref, workspaceId))),
    ])

    const userIdByIndex = new Map<number, number>()
    userSlots.forEach((s, i) => {
        const id = userIdsResolved[i]
        if (typeof id === 'number') userIdByIndex.set(s.index, id)
    })
    const groupByIndex = new Map<number, (typeof groupsResolved)[number]>()
    groupSlots.forEach((s, i) => {
        groupByIndex.set(s.index, groupsResolved[i])
    })

    // Walk the original input order to assemble dedup'd userIds and expandedFrom.
    const expandedFrom: ChannelMemberRefs['expandedFrom'] = []
    const seen = new Set<number>()
    const userIds: number[] = []
    const pushId = (id: number) => {
        if (!seen.has(id)) {
            seen.add(id)
            userIds.push(id)
        }
    }

    for (let i = 0; i < refs.length; i++) {
        if (userIdByIndex.has(i)) {
            const id = userIdByIndex.get(i)
            if (typeof id === 'number') pushId(id)
            continue
        }
        const group = groupByIndex.get(i)
        if (!group) continue
        expandedFrom.push({
            groupId: group.id,
            groupName: group.name,
            userIds: [...group.userIds],
        })
        for (const id of group.userIds) pushId(id)
    }

    return { userIds, expandedFrom }
}

export async function resolveUserRefs(refs: string, workspaceId: number): Promise<number[]> {
    const { getWorkspaceUsers } = await import('./api.js')
    const users = await getWorkspaceUsers(workspaceId)

    const parts = refs.split(',').map((r) => r.trim())
    const ids: number[] = []

    for (const ref of parts) {
        const parsed = parseRef(ref)
        if (parsed.type === 'id') {
            ids.push(parsed.id)
            continue
        }

        const query = ref.toLowerCase()
        const matches = users.filter(
            (u) => u.name.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query),
        )

        if (matches.length === 0) {
            throw new CliError('USER_NOT_FOUND', `No user found matching "${ref}"`, [
                'Run: tw users to list workspace members',
            ])
        }

        if (matches.length > 1) {
            const list = matches.map((u) => `  ${u.id}  ${u.name} <${u.email ?? ''}>`).join('\n')
            throw new CliError(
                'AMBIGUOUS_USER',
                `Multiple users match "${ref}":\n${list}\n\nUse numeric ID to specify.`,
            )
        }

        ids.push(matches[0].id)
    }

    return ids
}
