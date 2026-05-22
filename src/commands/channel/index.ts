import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import { listChannels } from './list.js'
import {
    addChannelMembers,
    listChannelMembers,
    removeChannelMembers,
    syncChannelMembers,
} from './members.js'
import { showChannelThreads } from './threads.js'

export function registerChannelCommand(program: Command): void {
    const channel = program
        .command('channel')
        .alias('channels')
        .description('Channel operations (list, threads)')

    channel
        .command('list [workspace-ref]', { isDefault: true })
        .description('List joined channels or discoverable public channels in a workspace')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option(
            '--scope <scope>',
            'Channel set to list: joined, public, or discoverable (default: joined)',
        )
        .option(
            '--state <state>',
            'Channel state to list: active, all, or archived (default: active)',
        )
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channels
  tw channels --state all
  tw channels --scope discoverable
  tw channels --scope public --state archived
  tw channels --scope public --state all --json
  tw channels --json
  tw channels "My Workspace" --scope discoverable --json

Notes:
  Defaults to active channels that you have joined.
  joined        Channels you have joined (private channels require --include-private-channels)
  public        Public channels visible in the workspace, whether joined or not
  discoverable  Public channels visible in the workspace that you have not joined
  active        Non-archived channels only
  all           Both active and archived channels
  archived      Archived channels only

  Twist does not expose unjoined private channels, so public/discoverable scopes never include them.`,
        )
        .action(listChannels)

    channel
        .command('threads <channel-ref> [workspace-ref]')
        .description('List threads in a channel with pagination and filtering')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--unread', 'Only show unread threads')
        .addOption(
            withCaseInsensitiveChoices(
                new Option(
                    '--archive-filter <filter>',
                    'Show active, archived, or all threads (default: active)',
                ),
                ['active', 'archived', 'all'],
            ),
        )
        .option('--since <date>', 'Threads updated on/after this date (ISO format)')
        .option('--until <date>', 'Threads updated before this date (ISO format)')
        .option('--limit <n>', 'Max threads per page (default: 50)')
        .option('--cursor <cursor>', 'Pagination cursor from a previous response')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel threads 12345
  tw channel threads "general"
  tw channel threads id:12345 --unread
  tw channel threads 12345 --archive-filter all --since 2026-01-01
  tw channel threads 12345 --limit 20 --json
  tw channel threads 12345 --limit 20 --cursor <cursor-from-previous>

Notes:
  Sorted newest-first by last activity. --limit, --cursor, --since, --until,
  and --unread are applied client-side; --archive-filter is applied server-side.`,
        )
        .action(showChannelThreads)

    channel
        .command('members <channel-ref>')
        .description('List channel members and groups whose members are all in the channel')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel members 12345
  tw channel members "general" --json

Notes:
  "Groups fully in channel" lists groups whose entire current membership is
  already in the channel — a hint, not a persistent link.`,
        )
        .action(listChannelMembers)

    channel
        .command('add <channel-ref> [refs...]')
        .description('Add users and/or groups to a channel')
        .option('--dry-run', 'Show what would change without changing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel add 12345 alice@doist.com bob@doist.com
  tw channel add "general" group:Frontend
  tw channel add 12345 alice group:Design id:789 --json

Notes:
  Refs accept user identifiers (id:N, email, name) or "group:<ref>" to expand
  a group to its current members. Group expansion is one-shot — users added
  later to the group will not auto-join the channel.`,
        )
        .action(addChannelMembers)

    channel
        .command('remove <channel-ref> [refs...]')
        .description('Remove users and/or groups from a channel')
        .option('--dry-run', 'Show what would change without changing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel remove 12345 alice@doist.com
  tw channel remove "general" group:Frontend

Notes:
  Refs accept user identifiers (id:N, email, name) or "group:<ref>" to expand
  a group to its current members.`,
        )
        .action(removeChannelMembers)

    channel
        .command('sync <channel-ref> [refs...]')
        .description('Replace channel membership with the resolved set of refs')
        .option('--apply', 'Actually mutate (otherwise dry-run)')
        .option('--include-self', 'Allow sync to remove the acting user')
        .option('--dry-run', 'Force dry-run (default behaviour)')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel sync 12345 group:Frontend group:Design
  tw channel sync "general" alice bob carol --apply
  tw channel sync 12345 group:Squad --apply --include-self

Notes:
  Dry-run by default. Pass --apply to mutate.
  Refuses to remove the acting user unless --include-self is also passed.
  Group expansion is one-shot — users added later to a referenced group will
  not auto-join the channel.`,
        )
        .action(syncChannelMembers)
}
