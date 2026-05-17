import { Command } from 'commander'
import { createTwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { currentAccount } from './current.js'
import { listAccounts } from './list.js'
import { removeAccount } from './remove.js'
import { useAccount } from './use.js'

export function registerAccountCommand(program: Command): void {
    const account = program.command('account').description('Manage stored CLI accounts')

    const store = createTwistTokenStore()

    account
        .command('list', { isDefault: true })
        .description('List stored CLI accounts')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action((options: ViewOptions) => listAccounts(options, store))

    account
        .command('current')
        .description('Show the currently active account (honours TWIST_API_TOKEN)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action((options: ViewOptions) => currentAccount(options, store))

    account
        .command('use <ref>')
        .description('Set the default stored account (id, id:<n>, or display name)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action((ref: string, options: ViewOptions) => useAccount(ref, options, store))

    account
        .command('remove <ref>')
        .description('Remove a stored account (clears keyring + config entry)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action((ref: string, options: ViewOptions) => removeAccount(ref, options, store))

    account.addHelpText(
        'after',
        `
Examples:
  tw account                       # list stored accounts (default subcommand)
  tw account list --json           # machine-readable: [{id, label, isDefault}, ...]
  tw account current               # show the active account
  tw account use id:42             # pin id:42 as the default account
  tw account use "Ada Lovelace"    # same, by display name
  tw account remove id:42          # forget id:42 (keyring + config entry)`,
    )
}
