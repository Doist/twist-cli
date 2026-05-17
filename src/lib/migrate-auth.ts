import { type MigrateAuthResult, migrateLegacyAuth } from '@doist/cli-core/auth'
import { createWrappedTwistClient } from './api.js'
import type { TwistAccount } from './auth-provider.js'
import { CONFIG_VERSION, getConfig, updateConfig } from './config.js'
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
            const client = createWrappedTwistClient(token)
            const user = await client.users.getSessionUser()
            const config = await getConfig()
            // Promote the v1 auth metadata onto the v2 account if it's there;
            // legacy `tw auth token` users have no `authMode` / `authScope`,
            // so we fall through to `'unknown'` / `''`, the same defaults
            // `validateToken` would have written.
            return {
                id: String(user.id),
                label: user.name,
                authMode: config.authMode ?? 'unknown',
                authScope: config.authScope ?? '',
            }
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
