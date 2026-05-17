import {
    type AccountRef,
    type AuthAccount,
    type AuthProvider,
    createKeyringTokenStore,
    createSecureStore,
    deriveChallenge,
    generateVerifier,
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

type TwistHandshake = Record<string, unknown> & {
    clientId: string
    clientSecret: string
    codeVerifier?: string
    authMode?: AuthMode
    authScope?: string
}

function asHandshake(value: Record<string, unknown>): TwistHandshake {
    return value as TwistHandshake
}

function authFailed(message: string, cause?: unknown): CliError {
    const detail = cause instanceof Error && cause.message ? `: ${cause.message}` : ''
    return new CliError('AUTH_FAILED', `${message}${detail}`, AUTH_HINTS)
}

async function registerDynamicClient(
    redirectUri: string,
): Promise<{ clientId: string; clientSecret: string }> {
    let response: Response
    try {
        response = await fetch(REGISTRATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                client_name: 'Twist CLI',
                client_uri: 'https://github.com/doist/twist-cli',
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'client_secret_basic',
                application_type: 'native',
                logo_uri: LOGO_URI,
            }),
        })
    } catch (error) {
        if (error instanceof CliError) throw error
        throw authFailed('Failed to register OAuth client', error)
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new CliError(
            'AUTH_FAILED',
            `Client registration failed: ${response.status} ${response.statusText} - ${errorText}`,
            AUTH_HINTS,
        )
    }

    let result: { client_id?: string; client_secret?: string }
    try {
        result = (await response.json()) as { client_id?: string; client_secret?: string }
    } catch (error) {
        throw authFailed('Invalid client registration response', error)
    }

    if (!result.client_id || !result.client_secret) {
        throw new CliError(
            'AUTH_FAILED',
            'Invalid client registration response: missing client_id or client_secret',
            AUTH_HINTS,
        )
    }

    return { clientId: result.client_id, clientSecret: result.client_secret }
}

export function createTwistAuthProvider(): AuthProvider<TwistAccount> {
    return {
        async prepare({ redirectUri }) {
            const { clientId, clientSecret } = await registerDynamicClient(redirectUri)
            const handshake: TwistHandshake = { clientId, clientSecret }
            return { handshake }
        },

        async authorize({ redirectUri, state, scopes, readOnly, handshake }) {
            const hs = asHandshake(handshake)
            const codeVerifier = generateVerifier()
            const codeChallenge = deriveChallenge(codeVerifier)
            const authMode: AuthMode = readOnly ? 'read-only' : 'read-write'
            const authScope = scopes.join(' ')

            const params = new URLSearchParams({
                client_id: hs.clientId,
                response_type: 'code',
                redirect_uri: redirectUri,
                scope: authScope,
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
            })

            const nextHandshake: TwistHandshake = {
                ...hs,
                codeVerifier,
                authMode,
                authScope,
            }
            return {
                authorizeUrl: `${AUTHORIZATION_URL}?${params.toString()}`,
                handshake: nextHandshake,
            }
        },

        async exchangeCode({ code, redirectUri, handshake }) {
            const hs = asHandshake(handshake)
            if (!hs.codeVerifier) {
                throw new CliError(
                    'AUTH_FAILED',
                    'Missing PKCE code verifier from authorize step',
                    AUTH_HINTS,
                )
            }

            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: hs.codeVerifier,
            })

            const credentials = btoa(`${hs.clientId}:${hs.clientSecret}`)

            let response: Response
            try {
                response = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        Authorization: `Basic ${credentials}`,
                    },
                    body: body.toString(),
                })
            } catch (error) {
                if (error instanceof CliError) throw error
                throw authFailed('Failed to exchange code for token', error)
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => '')
                throw new CliError(
                    'AUTH_FAILED',
                    `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
                    AUTH_HINTS,
                )
            }

            let data: {
                access_token?: string
                error?: string
                error_description?: string
            }
            try {
                data = (await response.json()) as typeof data
            } catch (error) {
                throw authFailed('Invalid token exchange response', error)
            }

            if (data.error) {
                throw new CliError(
                    'AUTH_FAILED',
                    `OAuth error: ${data.error} - ${data.error_description ?? 'Unknown error'}`,
                    AUTH_HINTS,
                )
            }

            if (!data.access_token) {
                throw new CliError(
                    'AUTH_FAILED',
                    'No access token received from OAuth server',
                    AUTH_HINTS,
                )
            }

            return { accessToken: data.access_token }
        },

        async validateToken({ token, handshake }) {
            const hs = asHandshake(handshake)
            const client = createWrappedTwistClient(token)
            const user = await client.users.getSessionUser()
            return toTwistAccount(user, { authMode: hs.authMode, authScope: hs.authScope })
        },
    }
}

// Twist-flavoured ref matcher: `parseRef` normalises `id:<n>` and `<n>` to the
// same numeric id, and labels match case-insensitively. cli-core's default is
// strict equality on `account.id` / `account.label`, so passing this in keeps
// the user-facing ref formats (`tw auth status --user 42`, `--user id:42`,
// `--user Ada`) that the previous custom store supported.
export function matchTwistAccount(account: TwistAccount, ref: AccountRef): boolean {
    const parsed = parseRef(ref)
    if (parsed.type === 'id') return Number(account.id) === parsed.id
    if (parsed.type === 'name') return account.label.toLowerCase() === parsed.name.toLowerCase()
    return false
}

const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

/** A migration result that means the v2 store is the authoritative source. */
function migrationIsConclusive(result: MigrateAuthResult<TwistAccount>): boolean {
    return (
        result.status === 'migrated' ||
        result.status === 'already-migrated' ||
        result.status === 'no-legacy-state'
    )
}

/**
 * Read v1 credentials still on disk (legacy keyring slot first, then the
 * plaintext `config.token` slot). Used only when `migrateLegacyAuth` couldn't
 * complete this run — never on the happy path. Returns a synthetic snapshot
 * with whatever v1 auth metadata is in `config.json` so consumers like `tw
 * auth status` keep working. `tw auth token <token>` users have no
 * `authUserId`; their synthetic snapshot carries `account.id === ''`
 * (matching the pre-γ1 behaviour of the old single-user adapter).
 */
async function readLegacyTokenSnapshot(): Promise<{
    token: string
    account: TwistAccount
} | null> {
    let token: string | null = null
    try {
        const secureStore = createSecureStore({
            serviceName: SECURE_STORE_SERVICE,
            account: LEGACY_KEYRING_ACCOUNT,
        })
        token = await secureStore.getSecret()
    } catch {
        // Keyring unreachable — fall through to plaintext.
    }
    const config = await getConfig()
    if (!token) token = config.token?.trim() || null
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
 * Best-effort clean-up of v1 state on disk. Runs before a write / clear when
 * `migrateLegacyAuth` couldn't complete — so a user who logs in with
 * `tw auth token <new>` or out via `tw auth logout` during the post-upgrade
 * offline window doesn't end up with v2 writes shadowed by a stale legacy
 * token. Mirrors the cleanup that `migrateLegacyAuth.cleanupLegacyConfig`
 * does once it can reach the API. Failures (offline keyring, etc.) are
 * swallowed: the v2 write is what counts, the legacy state is just noise.
 */
async function dischargeLegacyState(): Promise<void> {
    try {
        await createSecureStore({
            serviceName: SECURE_STORE_SERVICE,
            account: LEGACY_KEYRING_ACCOUNT,
        }).deleteSecret()
    } catch {
        // Keyring unreachable — the legacy entry stays put; harmless because
        // the v2 store is what `active()` will read once migration completes.
    }
    try {
        await updateConfig({
            token: undefined,
            authMode: undefined,
            authScope: undefined,
            authUserId: undefined,
            authUserName: undefined,
            pendingSecureStoreClear: undefined,
        })
    } catch {
        // Same rationale — best effort.
    }
}

/**
 * Memoised one-shot v1 → v2 migration trigger. The first read/write to the
 * store on a cold process awaits it; later operations short-circuit on the
 * resolved promise. Errors are swallowed (the cli-core helper itself runs in
 * silent mode and leaves v1 state untouched on failure) so the CLI never
 * fails to start because a migration attempt blew up; the runtime falls back
 * to the legacy snapshot below when the result isn't conclusive.
 *
 * Module-private; tests reset it with `vi.resetModules()` + dynamic
 * `import('./auth-provider.js')` so no test-only seam ships in dist/.
 */
let migrationPromise: Promise<MigrateAuthResult<TwistAccount> | null> | undefined
function ensureMigrated(): Promise<MigrateAuthResult<TwistAccount> | null> {
    if (!migrationPromise) {
        migrationPromise = runMigrateLegacyAuth({ silent: true }).catch(() => null)
    }
    return migrationPromise
}

/**
 * `TWIST_API_TOKEN=… tw <subcommand>` must work even when nothing is in the
 * keyring — cli-core's `KeyringTokenStore` only knows about its own backing
 * store, so we wrap `active()` to short-circuit to the env value when no
 * explicit `--user <ref>` is supplied. With an explicit ref the caller is
 * targeting a specific stored account, so the env var is intentionally
 * ignored.
 *
 * Every method that touches stored state also awaits `ensureMigrated()` so a
 * user who installed with `--ignore-scripts` (skipping the postinstall hook)
 * still gets their v1 token promoted to v2 transparently on first command.
 * When migration couldn't complete (offline `identifyAccount`, keyring
 * unreachable, …):
 *   - `active()` falls back to the legacy snapshot so the user isn't treated
 *     as logged out. An explicit `--user <ref>` is honoured against the
 *     legacy account so `tw --user <other-id>` can't accidentally resolve to
 *     the legacy default.
 *   - `set()` / `clear()` first discharge the legacy state on disk before
 *     writing v2, so a manual `tw auth token <new>` or `tw auth logout`
 *     doesn't leave a stale v1 token to shadow the v2 write on the next run.
 */
export function createTwistTokenStore(): TwistTokenStore {
    const inner = createKeyringTokenStore<TwistAccount>({
        serviceName: SECURE_STORE_SERVICE,
        userRecords: createTwistUserRecordStore(),
        recordsLocation: getConfigPath(),
        matchAccount: matchTwistAccount,
    })
    const maybeDischargeLegacy = async (): Promise<void> => {
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
 * Derive the source of the currently-active token. Lives here (next to the
 * store) so `lib/auth.ts` doesn't need to know about `UserRecordStore`'s
 * `fallbackToken` field — keeps the storage abstraction clean. Surfaces
 * `'config-file'` whenever a plaintext token is on disk, including the
 * legacy `config.token` slot that `migrateLegacyAuth` hasn't cleaned up
 * yet, so `tw doctor` / `tw config view` reports the security-relevant
 * state during the post-upgrade offline window.
 */
export async function getActiveTokenSource(): Promise<'env' | 'secure-store' | 'config-file'> {
    if (process.env[TOKEN_ENV_VAR]) return 'env'
    const config = await getConfig()
    const record = getDefaultUserRecord(config)
    if (record?.fallbackToken) return 'config-file'
    if (record) return 'secure-store'
    // No v2 record yet — legacy `config.token` may still be on disk if
    // `migrateLegacyAuth` was skipped (offline, etc.).
    if (config.token?.trim()) return 'config-file'
    return 'secure-store'
}
