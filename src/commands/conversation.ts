import type { Conversation } from '@doist/twist-sdk'
import chalk from 'chalk'
import { Command } from 'commander'
import { getCurrentWorkspaceId, getSessionUser, getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { openEditor, readStdin } from '../lib/input.js'
import { renderMarkdown } from '../lib/markdown.js'
import type { MutationOptions, PaginatedViewOptions, ViewOptions } from '../lib/options.js'
import { colors, formatJson, formatNdjson, isAccessible } from '../lib/output.js'
import { resolveConversationId, resolveUserRefs, resolveWorkspaceRef } from '../lib/refs.js'

type UnreadOptions = ViewOptions & { workspace?: string }

type ConversationViewOptions = PaginatedViewOptions

type ConversationWithOptions = PaginatedViewOptions & {
    workspace?: string
    includeGroups?: boolean
    snippet?: boolean
}

type ReplyOptions = MutationOptions

type DoneOptions = MutationOptions

const CONVERSATION_PAGE_LIMIT = 100

type ConversationPageArgs = {
    workspaceId: number
    archived?: boolean
    limit: number
    beforeId?: number
}

function buildConversationTitle(
    conversation: Pick<Conversation, 'title' | 'userIds'>,
    userMap: Map<number, string>,
): string {
    const participants = conversation.userIds
        .map((id) => userMap.get(id) || `user:${id}`)
        .join(', ')
    return conversation.title || `Conversation with ${participants}`
}

function sortByLastActiveDescending(a: Conversation, b: Conversation): number {
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
}

async function getAllConversations(workspaceId: number): Promise<Conversation[]> {
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

async function getConversationPages(initialArgs: ConversationPageArgs): Promise<Conversation[]> {
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

async function listConversationsWithUser(
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

async function showUnread(workspaceRef: string | undefined, options: UnreadOptions): Promise<void> {
    if (workspaceRef && options.workspace) {
        throw new Error('Cannot specify workspace both as argument and --workspace flag')
    }

    let workspaceId: number
    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        workspaceId = workspace.id
    } else {
        workspaceId = await getCurrentWorkspaceId()
    }

    const client = await getTwistClient()
    const unreadConversations = await client.conversations.getUnread(workspaceId)

    if (unreadConversations.length === 0) {
        console.log('No unread conversations.')
        return
    }

    const conversationCalls = unreadConversations.map((uc) =>
        client.conversations.getConversation(uc.conversationId, { batch: true }),
    )
    const conversationResponses = await client.batch(...conversationCalls)
    const conversations = conversationResponses.map((r) => r.data)

    const userIds = new Set<number>()
    for (const conv of conversations) {
        for (const id of conv.userIds) {
            userIds.add(id)
        }
    }

    const userCalls = [...userIds].map((id) =>
        client.workspaceUsers.getUserById({ workspaceId, userId: id }, { batch: true }),
    )
    const userResponses = await client.batch(...userCalls)
    const userMap = new Map(userResponses.map((r) => [r.data.id, r.data.name]))

    if (options.json) {
        const output = conversations.map((c) => ({
            ...c,
            participantNames: c.userIds.map((id) => userMap.get(id)),
        }))
        console.log(formatJson(output, 'conversation', options.full))
        return
    }

    if (options.ndjson) {
        const output = conversations.map((c) => ({
            ...c,
            participantNames: c.userIds.map((id) => userMap.get(id)),
        }))
        console.log(formatNdjson(output, 'conversation', options.full))
        return
    }

    for (const conv of conversations) {
        const participants = conv.userIds.map((id) => userMap.get(id) || `user:${id}`).join(', ')
        const title = conv.title || `Conversation with ${participants}`
        const unreadInfo = unreadConversations.find((uc) => uc.conversationId === conv.id)
        const unreadBadge = unreadInfo ? chalk.blue(isAccessible() ? ' (unread)' : ' *') : ''

        console.log(`${chalk.bold(title)}${unreadBadge}`)
        console.log(`  ${colors.timestamp(`id:${conv.id}`)}  ${colors.author(participants)}`)
        console.log(`  ${colors.url(conv.url)}`)
        console.log('')
    }
}

async function viewConversation(ref: string, options: ConversationViewOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)
    const client = await getTwistClient()
    const limit = options.limit ? parseInt(options.limit, 10) : 50

    const [convResponse, messagesResponse] = await client.batch(
        client.conversations.getConversation(conversationId, { batch: true }),
        client.conversationMessages.getMessages(
            {
                conversationId,
                limit,
            },
            { batch: true },
        ),
    )

    const conversation = convResponse.data
    const messages = messagesResponse.data

    const userIds = new Set<number>([...conversation.userIds, ...messages.map((m) => m.creator)])
    const userCalls = [...userIds].map((id) =>
        client.workspaceUsers.getUserById(
            { workspaceId: conversation.workspaceId, userId: id },
            { batch: true },
        ),
    )
    const userResponses = await client.batch(...userCalls)
    const userMap = new Map(userResponses.map((r) => [r.data.id, r.data.name]))

    if (options.json) {
        const output = {
            conversation: {
                ...conversation,
                participantNames: conversation.userIds.map((id) => userMap.get(id)),
            },
            messages: messages.map((m) => ({
                ...m,
                creatorName: userMap.get(m.creator),
            })),
        }
        console.log(formatJson(output, undefined, options.full))
        return
    }

    if (options.ndjson) {
        console.log(
            JSON.stringify({
                type: 'conversation',
                ...conversation,
                participantNames: conversation.userIds.map((id) => userMap.get(id)),
            }),
        )
        for (const m of messages) {
            console.log(
                JSON.stringify({ type: 'message', ...m, creatorName: userMap.get(m.creator) }),
            )
        }
        return
    }

    const title = buildConversationTitle(conversation, userMap)

    console.log(chalk.bold(title))
    console.log(colors.timestamp(`id:${conversation.id}`))
    console.log('')

    if (messages.length === 0) {
        console.log('No messages.')
        return
    }

    for (const message of messages) {
        const author = colors.author(userMap.get(message.creator) || `user:${message.creator}`)
        const time = colors.timestamp(formatRelativeDate(message.posted))
        console.log(`${author}  ${time}  ${colors.timestamp(`id:${message.id}`)}`)
        console.log(options.raw ? message.content : renderMarkdown(message.content))
        console.log('')
    }
}

async function replyToConversation(
    ref: string,
    content: string | undefined,
    options: ReplyOptions,
): Promise<void> {
    const conversationId = resolveConversationId(ref)

    let replyContent = await readStdin()
    if (!replyContent && content) {
        replyContent = content
    }
    if (!replyContent) {
        replyContent = await openEditor()
    }
    if (!replyContent || replyContent.trim() === '') {
        console.error('No content provided.')
        process.exit(1)
    }

    if (options.dryRun) {
        console.log('Dry run: would send message to conversation', conversationId)
        console.log('')
        console.log(replyContent)
        return
    }

    const client = await getTwistClient()
    const message = await client.conversationMessages.createMessage({
        conversationId,
        content: replyContent,
    })

    console.log(`Message sent: ${message.url}`)
}

async function markConversationDone(ref: string, options: DoneOptions): Promise<void> {
    const conversationId = resolveConversationId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would archive conversation ${conversationId}`)
        return
    }

    const client = await getTwistClient()
    await client.conversations.archiveConversation(conversationId)
    console.log(`Conversation ${conversationId} archived.`)
}

async function findConversationWithUser(
    userRef: string,
    workspaceRef: string | undefined,
    options: ConversationWithOptions,
): Promise<void> {
    try {
        if (workspaceRef && options.workspace) {
            throw new Error('Cannot specify workspace both as argument and --workspace flag')
        }

        let workspaceId: number
        const ref = workspaceRef || options.workspace

        if (ref) {
            const workspace = await resolveWorkspaceRef(ref)
            workspaceId = workspace.id
        } else {
            workspaceId = await getCurrentWorkspaceId()
        }

        const userIds = await resolveUserRefs(userRef, workspaceId)
        if (userIds.length !== 1) {
            throw new Error('Expected a single user reference')
        }

        const targetUserId = userIds[0]
        const client = await getTwistClient()
        const [sessionUser, targetUser, conversations] = await Promise.all([
            getSessionUser(),
            client.workspaceUsers.getUserById({ workspaceId, userId: targetUserId }),
            getAllConversations(workspaceId),
        ])

        if (targetUser.id === sessionUser.id) {
            throw new Error('Cannot look up a conversation with yourself')
        }

        const matchingConversations = conversations.filter((conversation) =>
            conversation.userIds.includes(targetUser.id),
        )

        if (options.includeGroups) {
            await listConversationsWithUser(matchingConversations, workspaceId, options)
            return
        }

        const directConversation = matchingConversations.find(
            (conversation) =>
                conversation.userIds.length === 2 &&
                conversation.userIds.includes(sessionUser.id) &&
                conversation.userIds.includes(targetUser.id),
        )

        if (!directConversation) {
            const groupConversationCount = matchingConversations.filter(
                (conversation) => conversation.userIds.length > 2,
            ).length

            const suggestion =
                groupConversationCount > 0
                    ? ` Found ${groupConversationCount} group conversation${groupConversationCount === 1 ? '' : 's'} with ${targetUser.name}. Use --include-groups to list them.`
                    : ''

            console.log(`No 1:1 conversation found with ${targetUser.name}.${suggestion}`)
            return
        }

        await listConversationsWithUser([directConversation], workspaceId, options)
    } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
    }
}

export function registerConversationCommand(program: Command): void {
    const conversation = program
        .command('conversation')
        .alias('convo')
        .description('Conversation (DM/group) operations')

    conversation
        .command('unread [workspace-ref]')
        .description('List unread conversations')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(showUnread)

    conversation
        .command('view [conversation-ref]', { isDefault: true })
        .description('Display a conversation with its messages')
        .option('--limit <n>', 'Max messages to show (default: 50)')
        .option('--since <date>', 'Messages newer than')
        .option('--until <date>', 'Messages older than')
        .option('--raw', 'Show raw markdown instead of rendered')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                conversation.help()
                return
            }
            return viewConversation(ref, options)
        })

    conversation
        .command('with <user-ref> [workspace-ref]')
        .description('Find your 1:1 conversation with a user')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--include-groups', 'List any conversation that includes this user')
        .option('--snippet', 'Include the latest message snippet in text output')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(findConversationWithUser)

    conversation
        .command('reply <conversation-ref> [content]')
        .description('Send a message in a conversation')
        .option('--dry-run', 'Show what would be sent without sending')
        .action(replyToConversation)

    conversation
        .command('done <conversation-ref>')
        .description('Archive a conversation')
        .option('--dry-run', 'Show what would happen without executing')
        .action(markConversationDone)
}
