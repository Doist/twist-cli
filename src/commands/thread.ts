import { Command, Option } from 'commander'
import { withUnvalidatedChoices } from '../lib/completion.js'
import { createThread } from './thread/create.js'
import { markThreadDone } from './thread/mutate.js'
import { replyToThread } from './thread/reply.js'
import { viewThread } from './thread/view.js'

export function registerThreadCommand(program: Command): void {
    const thread = program.command('thread').description('Thread operations')

    thread
        .command('view [thread-ref]', { isDefault: true })
        .description('Display a thread with its comments')
        .option('--comment <id>', 'Show only a specific comment')
        .option('--unread', 'Show only unread comments (with original post for context)')
        .option('--context <n>', 'Include N read comments before unread (use with --unread)')
        .option('--limit <n>', 'Max comments to show (default: 50)')
        .option('--since <date>', 'Comments newer than')
        .option('--until <date>', 'Comments older than')
        .option('--raw', 'Show raw markdown instead of rendered')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                thread.help()
                return
            }
            return viewThread(ref, options)
        })

    thread
        .command('reply <thread-ref> [content]')
        .description('Post a comment to a thread')
        .addOption(
            withUnvalidatedChoices(
                new Option(
                    '--notify <recipients>',
                    'Notification recipients: EVERYONE, EVERYONE_IN_THREAD, or comma-separated user IDs (default: EVERYONE_IN_THREAD)',
                ),
                ['EVERYONE', 'EVERYONE_IN_THREAD'],
            ),
        )
        .option('--dry-run', 'Show what would be posted without posting')
        .option('--json', 'Output posted comment as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(replyToThread)

    thread
        .command('create <channel-ref> <title> [content]')
        .description('Create a new thread in a channel')
        .option('--notify <recipients>', 'Comma-separated user IDs to notify')
        .option('--dry-run', 'Show what would be posted without posting')
        .option('--json', 'Output created thread as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(createThread)

    thread
        .command('done <thread-ref>')
        .description('Archive a thread (mark as done)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .action(markThreadDone)
}
