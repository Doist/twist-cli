import { Command } from 'commander'
import {
    addSharedSearchOptions,
    printSearchResults,
    runSearch,
    type SharedSearchOptions,
} from '../lib/search-helpers.js'

async function mentions(
    workspaceRef: string | undefined,
    options: SharedSearchOptions,
): Promise<void> {
    const { workspaceId, response } = await runSearch(workspaceRef, {
        ...options,
        mentionSelf: true,
    })

    printSearchResults(workspaceId, response, options)
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
