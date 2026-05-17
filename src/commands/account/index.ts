import { Command } from 'commander'
import { createTwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { currentAccount } from './current.js'
import { listAccounts } from './list.js'
import { removeAccount } from './remove.js'
import { useAccount } from './use.js'

function withJsonFlags(cmd: Command): Command {
    return cmd
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
}

export function registerAccountCommand(program: Command): void {
    const account = program.command('account').description('Manage stored CLI accounts')
    const store = createTwistTokenStore()

    withJsonFlags(
        account.command('list', { isDefault: true }).description('List stored CLI accounts'),
    ).action((options: ViewOptions) => listAccounts(options, store))

    withJsonFlags(
        account
            .command('current')
            .description('Show the currently active account (honours TWIST_API_TOKEN)'),
    ).action((options: ViewOptions) => currentAccount(options, store))

    withJsonFlags(
        account
            .command('use <ref>')
            .description('Set the default stored account (id, id:<n>, or display name)'),
    ).action((ref: string, options: ViewOptions) => useAccount(ref, options, store))

    withJsonFlags(
        account
            .command('remove <ref>')
            .description('Remove a stored account (clears keyring + config entry)'),
    ).action((ref: string, options: ViewOptions) => removeAccount(ref, options, store))

    account.addHelpText(
        'after',
        `
Examples:
  tw account                       # list stored accounts (default subcommand)
  tw account use "Ada Lovelace"    # pin Ada as the default account (id, id:N, or name)
  tw account remove id:42          # forget id:42 (clears keyring + config entry)`,
    )
}
