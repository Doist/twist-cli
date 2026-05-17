import { isLegacyAuthActive } from '../../lib/auth-provider.js'
import { CliError } from '../../lib/errors.js'

/**
 * Account-management commands operate against the v2 user-records store.
 * When `migrateLegacyAuth` couldn't complete (typically offline), the v2
 * store is empty and `ACCOUNT_NOT_FOUND` would be misleading — fail with
 * a dedicated envelope so callers get an actionable hint.
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
