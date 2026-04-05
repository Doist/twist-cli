import type { Conversation } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { isAccessible } from '../../lib/global-args.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { MutationOptions, PaginatedViewOptions, ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson } from '../../lib/output.js'

export type UnreadOptions = ViewOptions & { workspace?: string }

export type ConversationViewOptions = PaginatedViewOptions

export type ConversationWithOptions = PaginatedViewOptions & {
    workspace?: string
    includeGroups?: boolean
    snippet?: boolean
}

export type ReplyOptions = MutationOptions

export type MuteOptions = MutationOptions & { minutes?: string }

export type DoneOptions = MutationOptions

export const CONVERSATION_PAGE_LIMIT = 100

export type ConversationPageArgs = {
    workspaceId: number
    archived?: boolean
    limit: number
    beforeId?: number
}

export type ConversationLookupResult = {
    directConversation?: Conversation
    groupConversationCount: number
}

export function buildConversationTitle(
    conversation: Pick<Conversation, 'title' | 'userIds'>,
    userMap: Map<number, string>,
): string {
    const participants = conversation.userIds
        .map((id) => userMap.get(id) || `user:${id}`)
        .join(', ')
    return conversation.title || `Conversation with ${participants}`
}

export function sortByLastActiveDescending(a: Conversation, b: Conversation): number {
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
}

export async function getConversationPages(
    initialArgs: ConversationPageArgs,
): Promise<Conversation[]> {
    const client = await getTwistClient()
    const conversations: Conversation[] = []
    let beforeId = initialArgs.beforeId

    while (true) {
        const pageArgs: ConversationPageArgs = {
            ...initialArgs,
            beforeId,
        }
        const page = await client.conversations.getConversations(pageArgs)

        if (page.length === 0) {
            break
        }

        conversations.push(...page)

        if (page.length < initialArgs.limit) {
            break
        }

        const nextBeforeId = page[page.length - 1]?.id
        if (!nextBeforeId || nextBeforeId === beforeId) {
            break
        }
        beforeId = nextBeforeId
    }

    return conversations
}

export async function getAllConversations(workspaceId: number): Promise<Conversation[]> {
    const [activeConversations, archivedConversations] = await Promise.all([
        getConversationPages({ workspaceId, limit: CONVERSATION_PAGE_LIMIT }),
        getConversationPages({ workspaceId, archived: true, limit: CONVERSATION_PAGE_LIMIT }),
    ])

    const byId = new Map<number, Conversation>()
    for (const conversation of [...activeConversations, ...archivedConversations]) {
        byId.set(conversation.id, conversation)
    }

    return [...byId.values()].sort(sortByLastActiveDescending)
}

export async function findDirectConversation(
    workspaceId: number,
    sessionUserId: number,
    targetUserId: number,
): Promise<ConversationLookupResult> {
    const client = await getTwistClient()
    let groupConversationCount = 0

    for (const archived of [false, true]) {
        let beforeId: number | undefined

        while (true) {
            const pageArgs: ConversationPageArgs = {
                workspaceId,
                archived: archived || undefined,
                limit: CONVERSATION_PAGE_LIMIT,
                beforeId,
            }
            const page = await client.conversations.getConversations(pageArgs)

            if (page.length === 0) {
                break
            }

            for (const conversation of page) {
                if (!conversation.userIds.includes(targetUserId)) {
                    continue
                }

                const isSelfConversation = sessionUserId === targetUserId
                const isDirect = isSelfConversation
                    ? conversation.userIds.length === 1
                    : conversation.userIds.length === 2 &&
                      conversation.userIds.includes(sessionUserId)

                if (isDirect) {
                    return { directConversation: conversation, groupConversationCount }
                }

                if (conversation.userIds.length > (isSelfConversation ? 1 : 2)) {
                    groupConversationCount += 1
                }
            }

            beforeId = page[page.length - 1]?.id
        }
    }

    return { groupConversationCount }
}

export async function listConversationsWithUser(
    conversations: Conversation[],
    workspaceId: number,
    options: ConversationWithOptions,
): Promise<void> {
    if (conversations.length === 0) {
        console.log('No matching conversations found.')
        return
    }

    const client = await getTwistClient()
    const userIds = new Set<number>()
    for (const conversation of conversations) {
        for (const userId of conversation.userIds) {
            userIds.add(userId)
        }
    }

    const userCalls = [...userIds].map((userId) =>
        client.workspaceUsers.getUserById({ workspaceId, userId }, { batch: true }),
    )
    const userResponses = await client.batch(...userCalls)
    const userMap = new Map(userResponses.map((response) => [response.data.id, response.data.name]))

    const output = conversations.map((conversation) => ({
        ...conversation,
        participantNames: conversation.userIds.map((id) => userMap.get(id)),
    }))

    if (options.json) {
        console.log(formatJson(output, 'conversation', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatNdjson(output, 'conversation', options.full))
        return
    }

    for (const conversation of conversations) {
        const participants = conversation.userIds
            .map((id) => userMap.get(id) || `user:${id}`)
            .join(', ')
        const title = buildConversationTitle(conversation, userMap)
        const archivedBadge = conversation.archived
            ? chalk.yellow(isAccessible() ? ' (archived)' : ' [archived]')
            : ''

        console.log(`${chalk.bold(title)}${archivedBadge}`)
        console.log(
            `  ${colors.timestamp(`id:${conversation.id}`)}  ${colors.author(participants)}`,
        )
        if (options.snippet && conversation.snippet) {
            console.log(renderMarkdown(conversation.snippet))
        }
        console.log(`  ${colors.timestamp(formatRelativeDate(conversation.lastActive))}`)
        console.log(`  ${colors.url(conversation.url)}`)
        console.log('')
    }
}

export function parseMinutes(value: string | undefined): number {
    if (!value) return 60
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        console.error(`Invalid --minutes value: ${value} (must be a positive integer)`)
        process.exit(1)
    }
    return parsed
}
