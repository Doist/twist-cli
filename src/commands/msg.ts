import chalk from 'chalk'
import { Command } from 'commander'
import { getCurrentWorkspaceId, getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { openEditor, readStdin } from '../lib/input.js'
import { renderMarkdown } from '../lib/markdown.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveConversationId, resolveWorkspaceRef } from '../lib/refs.js'

interface UnreadOptions {
    workspace?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

interface ViewOptions {
    limit?: string
    since?: string
    until?: string
    raw?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

interface ReplyOptions {
    dryRun?: boolean
}

interface DoneOptions {
    dryRun?: boolean
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
        const _unreadInfo = unreadConversations.find((uc) => uc.conversationId === conv.id)

        console.log(chalk.bold(title))
        console.log(`  ${colors.timestamp(`id:${conv.id}`)}  ${colors.author(participants)}`)
        console.log(`  ${colors.url(conv.url)}`)
        console.log('')
    }
}

async function viewConversation(ref: string, options: ViewOptions): Promise<void> {
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

    const participants = conversation.userIds
        .map((id) => userMap.get(id) || `user:${id}`)
        .join(', ')
    const title = conversation.title || `Conversation with ${participants}`

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

export function registerMsgCommand(program: Command): void {
    const msg = program.command('msg').description('Conversation (DM/group) operations')

    msg.command('unread [workspace-ref]')
        .description('List unread conversations')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(showUnread)

    msg.command('view [conversation-ref]', { isDefault: true })
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
                msg.help()
                return
            }
            return viewConversation(ref, options)
        })

    msg.command('reply <conversation-ref> [content]')
        .description('Send a message in a conversation')
        .option('--dry-run', 'Show what would be sent without sending')
        .action(replyToConversation)

    msg.command('done <conversation-ref>')
        .description('Archive a conversation')
        .option('--dry-run', 'Show what would happen without executing')
        .action(markConversationDone)
}
