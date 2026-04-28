import { Command } from 'commander'
import {
    addSharedSearchOptions,
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
    const command = addSharedSearchOptions(
        program
            .command('mentions [workspace-ref]')
            .description('Show content mentioning the current user'),
        {
            limitDescription: 'Max results per page (default: 50)',
        },
    )

    command
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
