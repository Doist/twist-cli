import { type MigrateAuthResult, migrateLegacyAuth } from '@doist/cli-core/auth'
import { TwistApi } from '@doist/twist-sdk'
import { LEGACY_KEYRING_ACCOUNT, SECURE_STORE_SERVICE } from './auth-constants.js'
import type { TwistAccount } from './auth-provider.js'
import { getConfig, updateConfig } from './config.js'
import { toTwistAccount } from './twist-account.js'
import { createTwistUserRecordStore } from './user-records.js'

/**
 * Schema version this migration targets. Kept local (not the exported
 * `CONFIG_VERSION` from `config.ts`) so a future schema bump to v3 doesn't
 * cause this v1→v2 helper to spuriously re-run for already-migrated users:
 * `hasMigrated()` reads `>= 2`, `markMigrated()` writes exactly `2`.
 */
const V2_SCHEMA_VERSION = 2

/**
 * One-time v1 → v2 auth state migration. Both wakeup paths (postinstall + the
 * lazy hook inside `createTwistTokenStore`) call this with `silent: true` so a
 * regular `tw` invocation doesn't print a banner on the cold-cache run. The
 * underlying cli-core helper is idempotent — `hasMigrated()` short-circuits
 * once the durable marker is on disk.
 *
 * Talks to the Twist API via a raw `TwistApi` (not `createWrappedTwistClient`)
 * to keep migration outside the runtime auth / token-store module graph.
 */
export async function runMigrateLegacyAuth(
    options: { silent: boolean } = { silent: true },
): Promise<MigrateAuthResult<TwistAccount>> {
    return migrateLegacyAuth<TwistAccount>({
        serviceName: SECURE_STORE_SERVICE,
        legacyAccount: LEGACY_KEYRING_ACCOUNT,
        userRecords: createTwistUserRecordStore(),
        hasMigrated: async () => {
            const config = await getConfig()
            return (config.config_version ?? 0) >= V2_SCHEMA_VERSION
        },
        markMigrated: async () => {
            await updateConfig({ config_version: V2_SCHEMA_VERSION })
        },
        loadLegacyPlaintextToken: async () => {
            const config = await getConfig()
            return config.token?.trim() || null
        },
        identifyAccount: async (token) => {
            // Network call + config read are independent — fire them together
            // to shave a round trip off the first-run / postinstall path.
            const [user, config] = await Promise.all([
                new TwistApi(token).users.getSessionUser(),
                getConfig(),
            ])
            // Legacy `tw auth token` users have no `authMode` / `authScope` on
            // disk; `toTwistAccount` falls through to the same defaults
            // `validateToken` would have written.
            return toTwistAccount(user, {
                authMode: config.authMode,
                authScope: config.authScope,
            })
        },
        cleanupLegacyConfig: async () => {
            await updateConfig({
                token: undefined,
                authMode: undefined,
                authScope: undefined,
                authUserId: undefined,
                authUserName: undefined,
                pendingSecureStoreClear: undefined,
            })
        },
        silent: options.silent,
        logPrefix: 'twist-cli',
    })
}
