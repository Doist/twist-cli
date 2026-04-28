import { Command } from 'commander'
import {
    addSharedSearchOptions,
    printSearchCommandResults,
    runSearchCommand,
    type SearchCommandOptions,
} from '../lib/search-command.js'

type SearchOptions = SearchCommandOptions & {
    titleOnly?: boolean
    mentionMe?: boolean
}

async function search(
    query: string,
    workspaceRef: string | undefined,
    options: SearchOptions,
): Promise<void> {
    const { workspaceId, response } = await runSearchCommand(workspaceRef, {
        ...options,
        query: options.titleOnly ? undefined : query,
        title: options.titleOnly ? query : undefined,
        mentionSelf: options.mentionMe,
    })
    printSearchCommandResults(workspaceId, response, options)
}

export function registerSearchCommand(program: Command): void {
    const command = addSharedSearchOptions(
        program
            .command('search <query> [workspace-ref]')
            .description('Search content across a workspace'),
        {
            addUniqueFilters: (command) => {
                command
                    .option('--title-only', 'Search in thread titles only')
                    .option('--mention-me', 'Only results mentioning current user')
            },
        },
    )

    command
        .addHelpText(
            'after',
            `
Examples:
  tw search "deployment issue"
  tw search "bug report" --type threads --channel id:12345
  tw search "API" --author id:5678 --since 2025-01-01 --json
  tw search "incident" --all --json`,
        )
        .action(search)
}
