import { Command } from 'commander'
import { listSettableKeys, setConfigValue } from './set.js'
import { viewConfig } from './view.js'

export function registerConfigCommand(program: Command): void {
    const config = program.command('config').description('Manage CLI configuration')

    config
        .command('view', { isDefault: true })
        .description('Show the current CLI configuration file')
        .option('--json', 'Output the raw config as JSON')
        .option('--show-token', 'Include the full token instead of masking it')
        .action(viewConfig)

    config
        .command('set <key> <value>')
        .description('Set a user preference in the config file')
        .addHelpText(
            'after',
            `
Settable keys:
${listSettableKeys()}

Examples:
  $ tw config set unarchive-new-threads true
  $ tw config set unarchive-new-threads false`,
        )
        .action(setConfigValue)

    config.addHelpText(
        'after',
        `
Examples:
  $ tw config view                              # pretty-printed, token masked
  $ tw config view --json                       # raw JSON, token masked
  $ tw config view --show-token                 # include the full token
  $ tw config set unarchive-new-threads true    # change a user preference`,
    )
}
