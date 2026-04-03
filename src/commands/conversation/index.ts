import { Command } from 'commander'
import { markConversationDone } from './done.js'
import { muteConversation, unmuteConversation } from './mute.js'
import { replyToConversation } from './reply.js'
import { showUnread } from './unread.js'
import { viewConversation } from './view.js'
import { findConversationWithUser } from './with.js'

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
        .option('--json', 'Output sent message as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(replyToConversation)

    conversation
        .command('done <conversation-ref>')
        .description('Archive a conversation')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .action(markConversationDone)

    conversation
        .command('mute <conversation-ref>')
        .description('Mute a conversation (stop notifications)')
        .option('--minutes <n>', 'Number of minutes to mute (default: 60)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(muteConversation)

    conversation
        .command('unmute <conversation-ref>')
        .description('Unmute a muted conversation (restore notifications)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(unmuteConversation)
}
