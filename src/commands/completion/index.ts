import { Command } from 'commander'
import { installCompletion } from './install.js'
import { handleCompletionServer } from './server.js'
import { uninstallCompletion } from './uninstall.js'

export function registerCompletionCommand(program: Command): void {
    const completion = program.command('completion').description('Manage shell completions')

    completion
        .command('install [shell]')
        .description('Install shell completions (bash, zsh, fish)')
        .action(installCompletion)

    completion
        .command('uninstall')
        .description('Remove shell completions')
        .action(uninstallCompletion)

    // Hidden command invoked by the shell completion script at TAB time
    program
        .command('completion-server', { hidden: true })
        .description('Completion server (internal)')
        .allowUnknownOption()
        .allowExcessArguments()
        .action(() => handleCompletionServer(program))
}
