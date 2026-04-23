import type { Channel, Workspace } from '@doist/twist-sdk'
import { fetchWorkspaces, getTwistClient } from './api.js'
import { CliError } from './errors.js'

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
        const lower = parsed.name.toLowerCase()
        const exact = workspaces.find((w) => w.name.toLowerCase() === lower)
        if (exact) return exact

        const partial = workspaces.filter((w) => w.name.toLowerCase().includes(lower))
        if (partial.length === 1) return partial[0]
        if (partial.length > 1) {
            const matches = partial
                .slice(0, 5)
                .map((w) => `"${w.name}" (id:${w.id})`)
                .join(', ')
            throw new CliError(
                'AMBIGUOUS_WORKSPACE',
                `Multiple workspaces match "${ref}": ${matches}`,
            )
        }
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
        const channels = await client.channels.getChannels({ workspaceId })
        const lower = parsed.name.toLowerCase()
        const exact = channels.find((c) => c.name.toLowerCase() === lower)
        if (exact) return exact

        const partial = channels.filter((c) => c.name.toLowerCase().includes(lower))
        if (partial.length === 1) return partial[0]
        if (partial.length > 1) {
            const matches = partial
                .slice(0, 5)
                .map((c) => `"${c.name}" (id:${c.id})`)
                .join(', ')
            throw new CliError('AMBIGUOUS_CHANNEL', `Multiple channels match "${ref}": ${matches}`)
        }
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
