import type { Workspace } from '@doist/twist-sdk'
import { fetchWorkspaces } from './api.js'

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
        throw new Error(`Invalid ID: ${ref}`)
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
            throw new Error(`Workspace with ID ${parsed.id} not found`)
        }
        return workspace
    }

    if (parsed.type === 'url' && parsed.parsed.workspaceId) {
        const workspace = workspaces.find((w) => w.id === parsed.parsed.workspaceId)
        if (!workspace) {
            throw new Error(`Workspace with ID ${parsed.parsed.workspaceId} not found`)
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
            throw new Error(`Multiple workspaces match "${ref}": ${matches}`)
        }
    }

    throw new Error(`Workspace "${ref}" not found`)
}

export function resolveThreadId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.threadId) {
        return parsed.parsed.threadId
    }

    throw new Error(`Invalid thread reference: ${ref}. Use 123, id:123, or a Twist URL.`)
}

export function resolveChannelId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.channelId) {
        return parsed.parsed.channelId
    }

    throw new Error(`Invalid channel reference: ${ref}. Use 123, id:123, or a Twist URL.`)
}

export function resolveCommentId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.commentId) {
        return parsed.parsed.commentId
    }

    throw new Error(`Invalid comment reference: ${ref}. Use 123, id:123, or a Twist URL.`)
}

export function resolveConversationId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.conversationId) {
        return parsed.parsed.conversationId
    }

    throw new Error(`Invalid conversation reference: ${ref}. Use 123, id:123, or a Twist URL.`)
}

export function resolveMessageId(ref: string): number {
    const parsed = parseRef(ref)

    if (parsed.type === 'id') {
        return parsed.id
    }

    if (parsed.type === 'url' && parsed.parsed.messageId) {
        return parsed.parsed.messageId
    }

    throw new Error(`Invalid message reference: ${ref}. Use 123, id:123, or a Twist URL.`)
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
            throw new Error(`No user found matching "${ref}"`)
        }

        if (matches.length > 1) {
            const list = matches.map((u) => `  ${u.id}  ${u.name} <${u.email ?? ''}>`).join('\n')
            throw new Error(`Multiple users match "${ref}":\n${list}\n\nUse numeric ID to specify.`)
        }

        ids.push(matches[0].id)
    }

    return ids
}
