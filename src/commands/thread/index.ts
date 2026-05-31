import { Command, Option } from 'commander'
import { withUnvalidatedChoices } from '../../lib/completion.js'
import { collect } from '../../lib/options.js'
import { createThread } from './create.js'
import { deleteThread } from './delete.js'
import { markThreadDone } from './mutate.js'
import { muteThread, unmuteThread } from './mute.js'
import { renameThread } from './rename.js'
import { replyToThread } from './reply.js'
import { updateThread } from './update.js'
import { viewThread } from './view.js'

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
        .addHelpText(
            'after',
            `
Examples:
  tw thread 12345
  tw thread view 12345 --unread
  tw thread view 12345 --limit 10 --json`,
        )
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
        .option('--close', 'Close the thread after replying')
        .option('--reopen', 'Reopen the thread after replying')
        .option('--file <path>', 'Attach a file (repeatable; content optional)', collect, [])
        .option('--dry-run', 'Show what would be posted without posting')
        .option('--json', 'Output posted comment as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw thread reply 12345 "Sounds good!"
  echo "Long reply" | tw thread reply 12345
  tw thread reply 12345 "Done" --close --json
  tw thread reply 12345 "See attached" --file ./diagram.png
  tw thread reply 12345 --file ./a.png --file ./b.pdf`,
        )
        .action(replyToThread)

    thread
        .command('create <channel-ref> <title> [content]')
        .description('Create a new thread in a channel')
        .option('--notify <recipients>', 'Comma-separated user IDs to notify')
        .option(
            '--unarchive',
            'Unarchive after creation so the thread appears in your Inbox (overrides userSettings.unarchiveNewThreads when false)',
        )
        .option('--no-unarchive', 'Skip unarchive even if userSettings.unarchiveNewThreads is true')
        .option('--dry-run', 'Show what would be posted without posting')
        .option('--json', 'Output created thread as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw thread create 12345 "Weekly update" "Here's what happened..."
  echo "Body from stdin" | tw thread create id:12345 "Title"
  tw thread create 12345 "Title" "Body" --notify 67890,11111 --json
  tw thread create 12345 "Title" "Body" --unarchive`,
        )
        .action(createThread)

    thread
        .command('done <thread-ref>')
        .description('Archive a thread (mark as done)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw thread done 12345
  tw thread done 12345 --dry-run
  tw thread done 12345 --json`,
        )
        .action(markThreadDone)

    thread
        .command('delete <thread-ref>')
        .description('Permanently delete a thread')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw thread delete 12345 --yes
  tw thread delete 12345 --dry-run
  tw thread delete 12345 --yes --json`,
        )
        .action(deleteThread)

    thread
        .command('mute <thread-ref>')
        .description('Mute a thread (stop inbox notifications)')
        .option('--minutes <n>', 'Number of minutes to mute (default: 60)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw thread mute 12345
  tw thread mute 12345 --minutes 480`,
        )
        .action(muteThread)

    thread
        .command('rename <thread-ref> <title>')
        .description('Rename a thread (change its title)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(renameThread)

    thread
        .command('update <thread-ref> [content]')
        .description("Update a thread's body (the first post)")
        .option('--dry-run', 'Show what would be updated without updating')
        .option('--json', 'Output updated thread as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw thread update 12345 "Updated body text"
  echo "New body" | tw thread update 12345
  tw thread update 12345 "Fixed" --json`,
        )
        .action(updateThread)

    thread
        .command('unmute <thread-ref>')
        .description('Unmute a muted thread (restore inbox notifications)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw thread unmute 12345`,
        )
        .action(unmuteThread)
}
