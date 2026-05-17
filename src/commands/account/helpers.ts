import chalk from 'chalk'
import type { TwistAccount } from '../../lib/auth-provider.js'
import { isLegacyAuthActive } from '../../lib/auth-provider.js'
import { CliError } from '../../lib/errors.js'

/**
 * Canonical render of an account for human output. `id` and `label` are
 * guaranteed non-empty on real v2 records; legacy snapshots synthesised by
 * `readLegacyTokenSnapshot` carry empty strings and should never reach this
 * helper — `assertV2Available` guards every command that mutates state.
 */
export function formatAccountLabel(account: TwistAccount): string {
    return `${chalk.dim(`id:${account.id}`)}  ${account.label}`
}

/**
 * Account-management commands operate against the v2 user-records store.
 * When the CLI is still serving requests via the legacy keyring snapshot
 * (because `migrateLegacyAuth` couldn't complete — typically offline) the
 * v2 store is empty and `ACCOUNT_NOT_FOUND` would be misleading. Throw a
 * dedicated envelope so callers get an actionable hint instead.
 */
export async function assertV2Available(): Promise<void> {
    if (await isLegacyAuthActive()) {
        throw new CliError(
            'AUTH_MIGRATION_PENDING',
            'Cannot manage accounts while the legacy single-user token is still active. ' +
                'The CLI could not complete the v1 → v2 auth migration (usually because Twist was unreachable).',
            [
                'Run `tw auth status` while online to finish the migration',
                'Or run `tw auth logout` followed by `tw auth login` to start fresh',
            ],
        )
    }
}
