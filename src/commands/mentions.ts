import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import {
    printSearchCommandResults,
    runSearchCommand,
    type SearchCommandOptions,
} from '../lib/search-command.js'

async function mentions(
    workspaceRef: string | undefined,
    options: SearchCommandOptions,
): Promise<void> {
    const { workspaceId, response } = await runSearchCommand(workspaceRef, {
        ...options,
        mentionSelf: true,
    })

    printSearchCommandResults(workspaceId, response, options)
}

export function registerMentionsCommand(program: Command): void {
    program
        .command('mentions [workspace-ref]')
        .description('Show content mentioning the current user')
        .option('--workspace <ref>', 'Workspace ID or name')
        .option('--channel <channel-refs>', 'Filter by channels (comma-separated refs)')
        .option('--author <user-refs>', 'Filter by author (comma-separated refs)')
        .option('--to <user-refs>', 'Messages sent to user (comma-separated refs)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--type <type>', 'Filter: threads, messages, or all'),
                ['threads', 'messages', 'all'],
            ),
        )
        .option('--conversation <refs>', 'Limit to conversations (comma-separated refs)')
        .option('--since <date>', 'Content from date')
        .option('--until <date>', 'Content until date')
        .option('--limit <n>', 'Max results per page (default: 50)')
        .option('--cursor <cursor>', 'Pagination cursor')
        .option('--all', 'Fetch all pages of results')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .addHelpText(
            'after',
            `
Examples:
  tw mentions
  tw mentions --since 2026-04-01 --all
  tw mentions --type threads --json`,
        )
        .action(mentions)
}
