import { Command } from 'commander'
import { listAccountsCommand } from './list.js'
import { useAccountCommand } from './use.js'

export function registerAccountCommand(program: Command): void {
    const account = program
        .command('account')
        .description('Manage stored Twist accounts (multi-user)')

    account
        .command('list')
        .description('List all stored Twist accounts')
        .option('--json', 'Output as JSON')
        .action(listAccountsCommand)

    account
        .command('use <ref>')
        .description('Set the default account used when --user is not provided')
        .action((ref: string) => useAccountCommand(ref))

    account.addHelpText(
        'after',
        `
Examples:
  $ tw auth login                  # add an account (sets it as default if first)
  $ tw account list                # see all stored accounts
  $ tw account use me@example.com  # set default
  $ tw --user other@example.com inbox   # one-off override`,
    )
}
