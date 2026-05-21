import {
    type AccountRef,
    type AuthAccount,
    type AuthProvider,
    createDcrProvider,
    createKeyringTokenStore,
    createSecureStore,
    type KeyringTokenStore,
    type MigrateAuthResult,
} from '@doist/cli-core/auth'
import { createWrappedTwistClient } from './api.js'
import { LEGACY_KEYRING_ACCOUNT, SECURE_STORE_SERVICE } from './auth-constants.js'
import { type AuthMode, getConfig, getConfigPath, updateConfig } from './config.js'
import { CliError } from './errors.js'
import { runMigrateLegacyAuth } from './migrate-auth.js'
import { parseRef } from './refs.js'
import { makeTwistAccount, toTwistAccount } from './twist-account.js'
import { createTwistUserRecordStore, getDefaultUserRecord } from './user-records.js'

export const AUTHORIZATION_URL = 'https://twist.com/oauth/authorize'
export const TOKEN_URL = 'https://twist.com/oauth/access_token'
export const REGISTRATION_URL = 'https://twist.com/oauth/register'

const LOGO_URI =
    'https://raw.githubusercontent.com/Doist/twist-cli/d65c447ff453eb36af585044c2f5f2f602bcdb34/icons/twist-cli.png'

export const READ_WRITE_SCOPES = [
    'user:read',
    'user:write',
    'workspaces:read',
    'channels:read',
    'threads:read',
    'threads:write',
    'comments:read',
    'comments:write',
    'messages:read',
    'messages:write',
    'reactions:read',
    'reactions:write',
    'groups:read',
    'groups:write',
    'groups:remove',
    'search:read',
    'notifications:read',
]

export const READ_ONLY_SCOPES = [
    'user:read',
    'workspaces:read',
    'channels:read',
    'threads:read',
    'comments:read',
    'messages:read',
    'reactions:read',
    'groups:read',
    'search:read',
    'notifications:read',
]

const AUTH_HINTS = ['Try again: tw auth login', 'Or set TWIST_API_TOKEN environment variable']

/**
 * Narrow account shape: only fields that round-trip through the local token
 * store. `id` is the stringified numeric Twist user id (so cli-core's
 * `AuthAccount.id` string contract holds), `label` is the user's display
 * name. Richer session-user details are fetched on demand via the API
 * rather than threaded through the auth flow.
 */
export type TwistAccount = AuthAccount & {
    id: string
    label: string
    authMode: AuthMode
    authScope: string
}

export type TwistTokenStore = KeyringTokenStore<TwistAccount>

/**
 * Twist's OAuth flow uses RFC 7591 Dynamic Client Registration: each login
 * mints a fresh `client_id` / `client_secret`, then runs the standard PKCE
 * authorize + token exchange (HTTP Basic auth on the token endpoint). cli-core's
 * `createDcrProvider` drives all of that via `oauth4webapi`; the only
 * twist-specific piece is `validate`, which probes `getSessionUser` and records
 * the auth mode/scope the login was granted.
 *
 * `authMode` / `authScope` are derived from `handshake.readOnly` (folded in by
 * `runOAuthFlow`) rather than threaded through `authorize`, because the scope
 * set is itself a pure function of `readOnly` (see `resolveScopes` in login.ts).
 */
export function createTwistAuthProvider(): AuthProvider<TwistAccount> {
    return createDcrProvider<TwistAccount>({
        registrationUrl: REGISTRATION_URL,
        authorizeUrl: AUTHORIZATION_URL,
        tokenUrl: TOKEN_URL,
        clientMetadata: {
            clientName: 'Twist CLI',
            clientUri: 'https://github.com/doist/twist-cli',
            logoUri: LOGO_URI,
            applicationType: 'native',
            // Twist client_ids contain `_` (e.g. `twd_…`). oauth4webapi's
            // `client_secret_basic` form-url-encodes the Basic credential per
            // RFC 6749 §2.3.1 (`_` → `%5F`), and Twist's token endpoint doesn't
            // url-decode it, so the lookup fails with "client_id not found".
            // `client_secret_post` sends the credential in the body via
            // URLSearchParams, which preserves `_`, sidestepping the mismatch.
            tokenEndpointAuthMethod: 'client_secret_post',
        },
        errorHints: AUTH_HINTS,
        async validate({ token, handshake }) {
            const readOnly = Boolean(handshake.readOnly)
            const client = createWrappedTwistClient(token)
            const user = await client.users.getSessionUser()
            return toTwistAccount(user, {
                authMode: readOnly ? 'read-only' : 'read-write',
                authScope: (readOnly ? READ_ONLY_SCOPES : READ_WRITE_SCOPES).join(' '),
            })
        },
    })
}

/**
 * Accepts `42`, `id:42`, and case-insensitive labels — `parseRef` normalises
 * the numeric forms. Broader than cli-core's default strict-equality matcher.
 */
export function matchTwistAccount(account: TwistAccount, ref: AccountRef): boolean {
    const parsed = parseRef(ref)
    if (parsed.type === 'id') return Number(account.id) === parsed.id
    if (parsed.type === 'name') return account.label.toLowerCase() === parsed.name.toLowerCase()
    return false
}

const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

/** True when the v2 store is the authoritative source. */
function migrationIsConclusive(result: MigrateAuthResult<TwistAccount>): boolean {
    return (
        result.status === 'migrated' ||
        result.status === 'already-migrated' ||
        result.status === 'no-legacy-state'
    )
}

/**
 * Synthesise a snapshot from v1 state still on disk (legacy keyring slot,
 * then plaintext `config.token`). Fallback for when migration can't complete.
 * Token-only users with no `authUserId` get `account.id = ''`.
 */
async function readLegacyTokenSnapshot(): Promise<{
    token: string
    account: TwistAccount
} | null> {
    const fromKeyring = await createSecureStore({
        serviceName: SECURE_STORE_SERVICE,
        account: LEGACY_KEYRING_ACCOUNT,
    })
        .getSecret()
        .catch(() => null)
    const config = await getConfig()
    const token = fromKeyring || config.token?.trim() || null
    if (!token) return null
    return {
        token,
        account: makeTwistAccount({
            id: config.authUserId !== undefined ? String(config.authUserId) : '',
            label: config.authUserName ?? '',
            authMode: config.authMode,
            authScope: config.authScope,
        }),
    }
}

/**
 * Clear the legacy keyring slot + v1 flat config fields. Runs before a
 * write/clear when migration is inconclusive so v2 writes aren't shadowed
 * by a stale legacy token. Best-effort — failures leave legacy in place.
 */
async function dischargeLegacyState(): Promise<void> {
    await Promise.allSettled([
        createSecureStore({
            serviceName: SECURE_STORE_SERVICE,
            account: LEGACY_KEYRING_ACCOUNT,
        }).deleteSecret(),
        updateConfig({
            token: undefined,
            authMode: undefined,
            authScope: undefined,
            authUserId: undefined,
            authUserName: undefined,
            pendingSecureStoreClear: undefined,
        }),
    ])
}

/**
 * Memoised one-shot migration trigger. Resolves with `null` on rejection
 * so the CLI never fails to start because of a migration error — the
 * legacy snapshot fallback below handles that case. Tests reset the memo
 * with `vi.resetModules()` + a dynamic re-import.
 */
let migrationPromise: Promise<MigrateAuthResult<TwistAccount> | null> | undefined
function ensureMigrated(): Promise<MigrateAuthResult<TwistAccount> | null> {
    if (!migrationPromise) {
        migrationPromise = runMigrateLegacyAuth({ silent: true }).catch(() => null)
    }
    return migrationPromise
}

/**
 * True when the v2 store is empty but a legacy v1 token snapshot is still
 * the only thing keeping the CLI authenticated — typically because
 * `migrateLegacyAuth` couldn't reach the Twist API to identify the account
 * (`MigrateSkipReason: 'identify-failed'`). Account-management commands
 * use this to fail with a dedicated `AUTH_MIGRATION_PENDING` envelope
 * instead of a misleading `ACCOUNT_NOT_FOUND`.
 */
export async function isLegacyAuthActive(): Promise<boolean> {
    const result = await ensureMigrated()
    if (result !== null && migrationIsConclusive(result)) return false
    const legacy = await readLegacyTokenSnapshot()
    return legacy !== null
}

/**
 * Resolve a `ref` against the v2 store, returning the canonical account.
 * Throws `ACCOUNT_NOT_FOUND` on a miss. Shared between the `tw account ...`
 * commands and `withUserRefAware` so the same hint reaches every caller.
 */
export async function findAccountInStore(
    store: TwistTokenStore,
    ref: AccountRef,
): Promise<TwistAccount> {
    const records = await store.list()
    const match = records.find(({ account }) => matchTwistAccount(account, ref))
    if (!match) {
        throw new CliError('ACCOUNT_NOT_FOUND', `No stored account matches "${ref}".`, [
            'Run: tw account list',
        ])
    }
    return match.account
}

/**
 * `TWIST_API_TOKEN` short-circuits `active()` only when no explicit ref is
 * supplied — cli-core's `KeyringTokenStore` doesn't know about the env var,
 * and an explicit ref means the caller targets a specific stored account.
 *
 * `ensureMigrated()` runs on every stored-state op so `--ignore-scripts`
 * installs still migrate on first command. When migration isn't conclusive:
 *  - `active()` falls back to the legacy snapshot, honouring `ref` so it
 *    can't resolve to a different account than the caller asked for.
 *  - `set()` / `clear()` discharge legacy state on disk first so v2 writes
 *    aren't shadowed by a stale v1 token on the next read.
 */
export function createTwistTokenStore(): TwistTokenStore {
    const inner = createKeyringTokenStore<TwistAccount>({
        serviceName: SECURE_STORE_SERVICE,
        userRecords: createTwistUserRecordStore(),
        recordsLocation: getConfigPath(),
        matchAccount: matchTwistAccount,
    })
    async function maybeDischargeLegacy(): Promise<void> {
        const result = await ensureMigrated()
        if (result === null || !migrationIsConclusive(result)) {
            await dischargeLegacyState()
        }
    }
    return Object.assign(Object.create(inner) as TwistTokenStore, {
        async active(ref?: AccountRef) {
            if (ref === undefined) {
                const envToken = process.env[TOKEN_ENV_VAR]
                if (envToken) {
                    return {
                        token: envToken,
                        account: { id: '', label: '', authMode: 'unknown', authScope: '' },
                    }
                }
            }
            const result = await ensureMigrated()
            if (result === null || !migrationIsConclusive(result)) {
                const legacy = await readLegacyTokenSnapshot()
                if (legacy && (ref === undefined || matchTwistAccount(legacy.account, ref))) {
                    return legacy
                }
            }
            return inner.active(ref)
        },
        async set(account: TwistAccount, token: string) {
            await maybeDischargeLegacy()
            return inner.set(account, token)
        },
        async clear(ref?: AccountRef) {
            await maybeDischargeLegacy()
            return inner.clear(ref)
        },
        async list() {
            await ensureMigrated()
            return inner.list()
        },
        async setDefault(ref: AccountRef) {
            await ensureMigrated()
            return inner.setDefault(ref)
        },
    })
}

/**
 * Where the currently-active token lives. Returns `'config-file'` whenever
 * a plaintext token is on disk — including the legacy `config.token` slot —
 * so doctor/config-view reports the security-relevant state accurately.
 */
export async function getActiveTokenSource(): Promise<'env' | 'secure-store' | 'config-file'> {
    if (process.env[TOKEN_ENV_VAR]) return 'env'
    const config = await getConfig()
    const record = getDefaultUserRecord(config)
    if (record?.fallbackToken) return 'config-file'
    if (record) return 'secure-store'
    if (config.token?.trim()) return 'config-file'
    return 'secure-store'
}
