import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import { addChannelMembers } from './add.js'
import { archiveChannelCommand, unarchiveChannelCommand } from './archive.js'
import { createChannelCommand } from './create.js'
import { deleteChannelCommand } from './delete.js'
import { listChannels } from './list.js'
import { listChannelMembers } from './members.js'
import { removeChannelMembers } from './remove.js'
import { setChannelMembers } from './set.js'
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
        .command('create <name>')
        .description('Create a new channel')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--description <text>', 'Channel description')
        .option('--private', 'Create a private channel (default is public)')
        .option('--dry-run', 'Show what would be created without creating')
        .option('--json', 'Output created channel as JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel create "Engineering"
  tw channel create "Leadership" --private
  tw channel create "Marketing" --description "Marketing team channel"
  tw channel create "Design" --private --json`,
        )
        .action(createChannelCommand)

    channel
        .command('delete <channel-ref>')
        .description('Permanently delete a channel')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw channel delete 12345 --yes
  tw channel delete "Engineering" --dry-run
  tw channel delete id:12345 --yes --json`,
        )
        .action(deleteChannelCommand)

    channel
        .command('archive <channel-ref>')
        .description('Archive a channel')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw channel archive 12345
  tw channel archive "Engineering" --json

Notes:
  Archived channels can be listed with: tw channels --state archived`,
        )
        .action(archiveChannelCommand)

    channel
        .command('unarchive <channel-ref>')
        .description('Unarchive a channel')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw channel unarchive id:12345
  tw channel unarchive 12345 --json

Notes:
  Name-ref resolution only finds active channels — pass id: or numeric ID for archived channels.`,
        )
        .action(unarchiveChannelCommand)

    const members = channel
        .command('members')
        .description('Channel membership operations (list, add, remove, set)')

    members
        .command('list <channel-ref>', { isDefault: true })
        .description("List a channel's members and groups fully present in the channel")
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel members 12345
  tw channel members "general" --json
  tw channel members add 12345 alice group:Design
  tw channel members remove 12345 alice
  tw channel members set 12345 group:Squad --apply

Notes:
  "Groups fully in channel" lists groups whose entire current membership is
  already in the channel — a hint, not a persistent link.`,
        )
        .action(listChannelMembers)

    members
        .command('add <channel-ref> [refs...]')
        .description('Add users and/or groups to a channel')
        .option('--dry-run', 'Show what would change without changing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel members add 12345 alice@doist.com bob@doist.com
  tw channel members add "general" group:Frontend
  tw channel members add 12345 alice group:Design id:789 --json

Notes:
  Refs accept user identifiers (id:N, email, name) or "group:<ref>" to expand
  a group to its current members. Group expansion is one-shot — users added
  later to the group will not auto-join the channel.`,
        )
        .action(addChannelMembers)

    members
        .command('remove <channel-ref> [refs...]')
        .description('Remove users and/or groups from a channel')
        .option('--dry-run', 'Show what would change without changing')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel members remove 12345 alice@doist.com
  tw channel members remove "general" group:Frontend

Notes:
  Refs accept user identifiers (id:N, email, name) or "group:<ref>" to expand
  a group to its current members.`,
        )
        .action(removeChannelMembers)

    members
        .command('set <channel-ref> [refs...]')
        .description('Replace channel membership with the resolved set of refs')
        .option('--apply', 'Actually mutate (otherwise dry-run)')
        .option('--include-self', 'Allow set to remove the acting user')
        .option('--dry-run', 'Force dry-run (default behaviour)')
        .option('--json', 'Output result as JSON')
        .option('--full', 'Include the full updated channel in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw channel members set 12345 group:Frontend group:Design
  tw channel members set "general" alice bob carol --apply
  tw channel members set 12345 group:Squad --apply --include-self

Notes:
  Dry-run by default. Pass --apply to mutate.
  Refuses to remove the acting user unless --include-self is also passed.
  Group expansion is one-shot — users added later to a referenced group will
  not auto-join the channel.`,
        )
        .action(setChannelMembers)
}
