import { Command } from 'commander'
import { deleteMessage } from './delete.js'
import { updateMessage } from './update.js'
import { viewMessage } from './view.js'

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
        .option('--json', 'Output updated message as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(updateMessage)

    msg.command('delete <message-ref>')
        .description('Delete a conversation message')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .action(deleteMessage)
}
