import type { AccountRef } from '@doist/cli-core/auth'
import chalk from 'chalk'
import { Command } from 'commander'
import {
    createTwistTokenStore,
    matchTwistAccount,
    type TwistAccount,
    type TwistTokenStore,
} from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { formatJson, formatNdjson } from '../../lib/output.js'
import { logTokenStorageResult } from '../auth/helpers.js'

type ViewOptions = { json?: boolean; ndjson?: boolean }

function refLabel(account: TwistAccount): string {
    return account.id ? `id:${account.id}` : account.label || '(unknown)'
}

function findAccount(
    records: ReadonlyArray<{ account: TwistAccount }>,
    ref: AccountRef,
): TwistAccount {
    const match = records.find(({ account }) => matchTwistAccount(account, ref))
    if (!match) {
        throw new CliError('ACCOUNT_NOT_FOUND', `No stored account matches "${ref}".`, [
            'Run: tw account list',
        ])
    }
    return match.account
}

async function listAccounts(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    const records = await store.list()
    const rows = records.map(({ account, isDefault }) => ({
        id: account.id,
        label: account.label,
        isDefault,
    }))

    if (options.json) {
        console.log(formatJson(rows))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson(rows))
        return
    }

    if (rows.length === 0) {
        console.log('No stored accounts. Run `tw auth login` to add one.')
        return
    }

    const defaultRow = rows.find((r) => r.isDefault)
    console.log(`Stored accounts (${rows.length}):`)
    for (const row of rows) {
        const marker = row.isDefault ? chalk.green('*') : ' '
        const id = chalk.dim(`id:${row.id}`)
        console.log(`  ${marker} ${id}  ${row.label}`)
    }
    if (defaultRow) {
        console.log(`Default: ${chalk.dim(`id:${defaultRow.id}`)}  ${defaultRow.label}`)
    } else {
        console.log(chalk.dim('Default: (none — first account is used)'))
    }
}

async function currentAccount(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    if (process.env[TOKEN_ENV_VAR]) {
        const payload = { source: 'env' as const }
        if (options.json) {
            console.log(formatJson(payload))
            return
        }
        if (options.ndjson) {
            console.log(formatNdjson([payload]))
            return
        }
        console.log(
            `Active token sourced from environment variable ${TOKEN_ENV_VAR} (no stored account).`,
        )
        return
    }

    const snapshot = await store.active()
    if (!snapshot) {
        throw new CliError('NO_TOKEN', 'No stored account is currently active.', [
            'Run: tw auth login',
        ])
    }
    const { account } = snapshot
    const payload = {
        id: account.id,
        label: account.label,
        authMode: account.authMode,
        authScope: account.authScope || undefined,
        source: 'config' as const,
    }

    if (options.json) {
        console.log(formatJson(payload))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson([payload]))
        return
    }

    console.log(`Active account: ${chalk.dim(`id:${account.id}`)}  ${account.label}`)
    console.log(`  Mode:  ${account.authMode}`)
    if (account.authScope) console.log(`  Scope: ${account.authScope}`)
}

async function useAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    const records = await store.list()
    const account = findAccount(records, ref)
    await store.setDefault(ref)

    const payload = { id: account.id, label: account.label, isDefault: true }
    if (options.json) {
        console.log(formatJson(payload))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson([payload]))
        return
    }
    console.log(`✓ Default account set to ${refLabel(account)}  ${account.label}`)
}

async function removeAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    const records = await store.list()
    const account = findAccount(records, ref)
    await store.clear(ref)

    const payload = { id: account.id, label: account.label, removed: true }
    const isMachineOutput = options.json || options.ndjson
    if (options.json) {
        console.log(formatJson(payload))
    } else if (options.ndjson) {
        console.log(formatNdjson([payload]))
    } else {
        console.log(`✓ Removed account ${refLabel(account)}  ${account.label}`)
    }

    const clearResult = store.getLastClearResult()
    if (clearResult) {
        logTokenStorageResult(
            clearResult,
            'Stored token removed from the system credential manager',
            isMachineOutput,
        )
    }
}

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
  tw account list                  # list stored accounts, default marked
  tw account current               # show the active account
  tw account use id:42             # pin id:42 as the default account
  tw account use "Ada Lovelace"    # same, by display name
  tw account remove id:42          # forget id:42 (keyring + config entry)`,
    )
}
