import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { openEditor, readStdin } from '../lib/input.js'
import { renderMarkdown } from '../lib/markdown.js'
import { colors, formatJson, formatNdjson } from '../lib/output.js'
import { resolveMessageId } from '../lib/refs.js'

interface ViewOptions {
    raw?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
}

interface UpdateOptions {
    dryRun?: boolean
}

interface DeleteOptions {
    dryRun?: boolean
}

async function viewMessage(ref: string, options: ViewOptions): Promise<void> {
    const messageId = resolveMessageId(ref)
    const client = await getTwistClient()
    const message = await client.conversationMessages.getMessage(messageId)

    const userResponse = await client.workspaceUsers.getUserById(
        { workspaceId: message.workspaceId, userId: message.creator },
        { batch: false },
    )
    const creatorName = userResponse.name

    if (options.json) {
        const output = { ...message, creatorName }
        console.log(formatJson(output, options.full ? undefined : 'message', options.full))
        return
    }

    if (options.ndjson) {
        const output = { ...message, creatorName }
        console.log(formatNdjson([output], options.full ? undefined : 'message', options.full))
        return
    }

    const author = colors.author(creatorName)
    const time = colors.timestamp(formatRelativeDate(message.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${message.id}`)}`)
    console.log(options.raw ? message.content : renderMarkdown(message.content))
    console.log('')
}

async function updateMessage(
    ref: string,
    content: string | undefined,
    options: UpdateOptions,
): Promise<void> {
    const messageId = resolveMessageId(ref)

    let newContent = await readStdin()
    if (!newContent && content) {
        newContent = content
    }
    if (!newContent) {
        newContent = await openEditor()
    }
    if (!newContent || newContent.trim() === '') {
        console.error('No content provided.')
        process.exit(1)
    }

    if (options.dryRun) {
        console.log(`Dry run: would update message ${messageId}`)
        console.log('')
        console.log(newContent)
        return
    }

    const client = await getTwistClient()
    const message = await client.conversationMessages.updateMessage({
        id: messageId,
        content: newContent,
    })

    console.log(`Message updated: ${message.url}`)
}

async function deleteMessage(ref: string, options: DeleteOptions): Promise<void> {
    const messageId = resolveMessageId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would delete message ${messageId}`)
        return
    }

    const client = await getTwistClient()
    await client.conversationMessages.deleteMessage(messageId)
    console.log(`Message ${messageId} deleted.`)
}

export function registerMsgCommand(program: Command): void {
    const msg = program
        .command('msg')
        .alias('message')
        .description('Conversation message operations (view, update, delete)')

    msg.command('view [message-ref]', { isDefault: true })
        .description('View a single conversation message')
        .option('--raw', 'Show raw markdown instead of rendered')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                msg.help()
                return
            }
            return viewMessage(ref, options)
        })

    msg.command('update <message-ref> [content]')
        .description('Edit a conversation message')
        .option('--dry-run', 'Show what would be updated without updating')
        .action(updateMessage)

    msg.command('delete <message-ref>')
        .description('Delete a conversation message')
        .option('--dry-run', 'Show what would happen without executing')
        .action(deleteMessage)
}
