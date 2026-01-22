import type { SearchResult } from '@doist/twist-sdk'
import { getApiToken } from './auth.js'

const BASE_URL = 'https://api.twist.com/api/v3'

export type SearchType = 'threads' | 'messages' | 'all'

export interface ExtendedSearchParams {
    workspaceId: number
    query?: string
    title?: string
    type?: SearchType
    channelIds?: number[]
    conversationIds?: number[]
    authorIds?: number[]
    toUserIds?: number[]
    mentionSelf?: boolean
    dateFrom?: string
    dateTo?: string
    limit?: number
    cursor?: string
}

export interface ExtendedSearchResponse {
    items: SearchResult[]
    nextCursorMark?: string
    hasMore: boolean
    isPlanRestricted: boolean
}

function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function camelCaseKeys<T>(obj: T): unknown {
    if (Array.isArray(obj)) {
        return obj.map((item) => camelCaseKeys(item))
    }
    if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const camelKey = toCamelCase(key)
            result[camelKey] = camelCaseKeys(value)
        }
        return result
    }
    return obj
}

function transformSearchResult(item: Record<string, unknown>): SearchResult {
    const result = camelCaseKeys(item) as Record<string, unknown>
    if (typeof result.snippetLastUpdatedTs === 'number') {
        result.snippetLastUpdated = new Date(result.snippetLastUpdatedTs * 1000)
        delete result.snippetLastUpdatedTs
    }
    return result as unknown as SearchResult
}

export async function extendedSearch(
    params: ExtendedSearchParams,
): Promise<ExtendedSearchResponse> {
    const token = await getApiToken()

    const apiParams: Record<string, string | number | boolean> = {
        workspace_id: params.workspaceId,
    }

    if (params.query) apiParams.query = params.query
    if (params.title) {
        apiParams.title = params.title
        if (!params.query) apiParams.query = params.title
    }
    if (params.type) apiParams.type = params.type
    if (params.channelIds) apiParams.channel_ids = JSON.stringify(params.channelIds)
    if (params.conversationIds) apiParams.conversation_ids = JSON.stringify(params.conversationIds)
    if (params.authorIds) apiParams.from_user_id = params.authorIds[0]
    if (params.toUserIds) apiParams.to_user_id = params.toUserIds[0]
    if (params.mentionSelf) apiParams.mention_self = params.mentionSelf
    if (params.dateFrom) apiParams.after_ts = new Date(params.dateFrom).getTime() / 1000
    if (params.dateTo) apiParams.before_ts = new Date(params.dateTo).getTime() / 1000
    if (params.limit) apiParams.limit = params.limit
    if (params.cursor) apiParams.cursor_mark = params.cursor

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(apiParams)) {
        searchParams.append(key, String(value))
    }

    const url = `${BASE_URL}/search?${searchParams.toString()}`

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Search API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const items = (data.items || []).map((item: Record<string, unknown>) =>
        transformSearchResult(item),
    )
    return {
        items,
        nextCursorMark: data.next_cursor_mark,
        hasMore: data.has_more ?? false,
        isPlanRestricted: data.is_plan_restricted ?? false,
    }
}
