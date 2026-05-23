import {
    type AccountRef,
    attachAccountListCommand,
    attachAccountRemoveCommand,
    attachAccountUseCommand,
} from '@doist/cli-core/auth'
import chalk from 'chalk'
import { Command } from 'commander'
import { createTwistTokenStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { logTokenStorageResult } from '../auth/helpers.js'
import { currentAccount } from './current.js'
import { assertV2Available } from './helpers.js'

/**
 * Guard the v2-store mutators so a pending v1→v2 migration (store empty, legacy
 * token still live) surfaces AUTH_MIGRATION_PENDING instead of a misleading
 * empty list / ACCOUNT_NOT_FOUND. cli-core's attachers own the command action,
 * so the guard lives in the store rather than at a call site. `current` uses the
 * unguarded store — it reports the legacy/env session rather than erroring.
 */
function withLegacyGuard(store: TwistTokenStore): TwistTokenStore {
    // Cache the check: a cli-core attacher can call the store more than once
    // per command (`use --json` does setDefault + a follow-up list), and legacy
    // state can't change mid-command, so read it at most once per invocation.
    let guard: Promise<void> | undefined
    const ensureV2 = () => (guard ??= assertV2Available())
    return Object.assign(Object.create(store) as TwistTokenStore, {
        async list() {
            await ensureV2()
            return store.list()
        },
        async setDefault(ref: AccountRef) {
            await ensureV2()
            return store.setDefault(ref)
        },
        async clear(ref?: AccountRef) {
            await ensureV2()
            return store.clear(ref)
        },
    })
}

export function registerAccountCommand(program: Command): void {
    const account = program.command('account').description('Manage stored CLI accounts')
    const store = createTwistTokenStore()
    const guarded = withLegacyGuard(store)

    attachAccountListCommand(account, {
        store: guarded,
        description: 'List stored Twist accounts',
        renderText: (ctx) => {
            if (ctx.accounts.length === 0) {
                return 'No stored accounts. Run `tw auth login` to add one.'
            }
            const lines = [`Stored accounts (${ctx.accounts.length}):`]
            for (const { account: acc, isDefault } of ctx.accounts) {
                const marker = isDefault ? chalk.green('*') : ' '
                lines.push(`  ${marker} ${chalk.dim(`id:${acc.id}`)}  ${acc.label}`)
            }
            const def = ctx.accounts.find((entry) => entry.isDefault)
            if (def) {
                lines.push(`Default: ${chalk.dim(`id:${def.account.id}`)}  ${def.account.label}`)
            }
            return lines
        },
    })

    attachAccountUseCommand(account, {
        store: guarded,
        description: 'Set the default stored account (id, id:<n>, or display name)',
    })

    attachAccountRemoveCommand(account, {
        store: guarded,
        description: 'Remove a stored account (clears keyring + config entry)',
        onRemoved: (ctx) => {
            const result = store.getLastClearResult()
            if (result) {
                logTokenStorageResult(
                    result,
                    'Stored token removed from the system credential manager',
                    ctx.view.json || ctx.view.ndjson,
                )
            }
        },
    })

    // `current` stays bespoke: cli-core's attacher resolves via the store's
    // token-free `activeAccount()`, bypassing twist's TWIST_API_TOKEN / legacy
    // overrides, and its sync render hooks can't run the async legacy check.
    account
        .command('current')
        .description('Show the currently active account (honours TWIST_API_TOKEN)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action((options: ViewOptions) => currentAccount(options, store))

    // The list attacher adds `list` without commander's `isDefault`, so wire the
    // parent default explicitly to keep `tw account` (no subcommand) listing.
    ;(account as unknown as { _defaultCommandName: string })._defaultCommandName = 'list'

    account.addHelpText(
        'after',
        `
Examples:
  tw account                       # list stored accounts (default subcommand)
  tw account use "Alan Grant"      # pin Alan as the default account (id, id:N, or name)
  tw account remove id:42          # forget id:42 (clears keyring + config entry)`,
    )
}
