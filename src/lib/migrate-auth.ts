import { type MigrateAuthResult, migrateLegacyAuth } from '@doist/cli-core/auth'
import { TwistApi } from '@doist/twist-sdk'
import type { TwistAccount } from './auth-provider.js'
import { CONFIG_VERSION, getConfig, updateConfig } from './config.js'
import { toTwistAccount } from './twist-account.js'
import { createTwistUserRecordStore } from './user-records.js'

const SERVICE_NAME = 'twist-cli'
// Legacy pre-γ1 keyring slot. cli-core's `migrateLegacyAuth` deletes the secret
// stored under this slug after a successful migration. After γ1, the runtime
// uses cli-core's default `user-${id}` slug.
const LEGACY_KEYRING_ACCOUNT = 'api-token'

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
        serviceName: SERVICE_NAME,
        legacyAccount: LEGACY_KEYRING_ACCOUNT,
        userRecords: createTwistUserRecordStore(),
        hasMigrated: async () => {
            const config = await getConfig()
            return config.config_version === CONFIG_VERSION
        },
        markMigrated: async () => {
            await updateConfig({ config_version: CONFIG_VERSION })
        },
        loadLegacyPlaintextToken: async () => {
            const config = await getConfig()
            return config.token?.trim() || null
        },
        identifyAccount: async (token) => {
            const user = await new TwistApi(token).users.getSessionUser()
            const config = await getConfig()
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
