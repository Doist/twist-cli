import {
    type AccountRef,
    type AuthAccount,
    type AuthProvider,
    deriveChallenge,
    generateVerifier,
    type TokenStore,
} from '@doist/cli-core/auth'
import { createWrappedTwistClient } from './api.js'
import {
    clearApiToken,
    NoTokenError,
    probeApiToken,
    saveApiToken,
    type TokenStorageResult,
} from './auth.js'
import type { AuthMode } from './config.js'
import { CliError } from './errors.js'
import { parseRef } from './refs.js'
import { SecureStoreUnavailableError } from './secure-store.js'

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
            return {
                id: String(user.id),
                label: user.name,
                authMode: hs.authMode ?? 'unknown',
                authScope: hs.authScope ?? '',
            }
        },
    }
}

export type TwistTokenStore = TokenStore<TwistAccount> & {
    getLastStorageResult(): TokenStorageResult | undefined
    getLastClearResult(): TokenStorageResult | undefined
}

export function createTwistTokenStore(): TwistTokenStore {
    let lastStorageResult: TokenStorageResult | undefined
    let lastClearResult: TokenStorageResult | undefined

    /**
     * Read the stored credential. By default `NoTokenError` collapses to
     * `null` (i.e. "nothing stored" is not an exception), while
     * `SecureStoreUnavailableError` propagates so callers see a keyring
     * outage as distinct from "no account". The legacy `active()` no-ref
     * path opts in to also tolerate the outage so headless / keyring-less
     * hosts keep falling through to the standard `NoTokenError` envelope
     * (matching the historical `getApiToken` → `showStatus()` behaviour).
     */
    async function loadStoredSnapshot(
        options: { tolerateOutage?: boolean } = {},
    ): Promise<{ token: string; account: TwistAccount } | null> {
        try {
            const { token, metadata } = await probeApiToken()
            return {
                token,
                account: {
                    id: metadata.authUserId !== undefined ? String(metadata.authUserId) : '',
                    label: metadata.authUserName ?? '',
                    authMode: metadata.authMode,
                    authScope: metadata.authScope ?? '',
                },
            }
        } catch (error) {
            if (error instanceof NoTokenError) return null
            if (error instanceof SecureStoreUnavailableError) {
                if (options.tolerateOutage) return null
                throw error
            }
            throw error
        }
    }

    /**
     * Match the stored account against the user-supplied `--user <ref>`,
     * normalising through `parseRef` so `id:42`, `42`, and a case-insensitive
     * label all resolve consistently with the rest of the CLI. URL refs
     * never apply to accounts — fall through to "no match" instead of
     * silently accepting one.
     */
    function matchesRef(account: TwistAccount, ref: AccountRef): boolean {
        const parsed = parseRef(ref)
        if (parsed.type === 'id') return Number(account.id) === parsed.id
        if (parsed.type === 'name') {
            return account.label.toLowerCase() === parsed.name.toLowerCase()
        }
        return false
    }

    /**
     * Single source of truth for ref-aware lookups. Returns the snapshot
     * when `ref` matches the stored account, throws `ACCOUNT_NOT_FOUND`
     * otherwise (including when nothing is stored). Storage outages
     * propagate so the caller sees the underlying failure rather than
     * a misleading "account not found".
     */
    async function resolveByRef(
        ref: AccountRef,
    ): Promise<{ token: string; account: TwistAccount }> {
        const snapshot = await loadStoredSnapshot()
        if (!snapshot || !matchesRef(snapshot.account, ref)) {
            throw new CliError('ACCOUNT_NOT_FOUND', `No stored account matches "${ref}".`)
        }
        return snapshot
    }

    return {
        async active(ref?: AccountRef) {
            // No-ref legacy path — tolerate missing keyring / no token and
            // return null so downstream callers (status's `fetchLive`,
            // login's pre-flight, etc.) keep falling through to their own
            // `NoTokenError` envelope rather than seeing a raw keyring
            // error. Returning a snapshot whenever a token resolves — even
            // when the persisted identity is empty (env var, manual
            // `tw auth token`, pre-upgrade config) — also avoids a second
            // credential read downstream.
            if (ref === undefined) {
                return loadStoredSnapshot({ tolerateOutage: true })
            }
            return resolveByRef(ref)
        },
        async set(account, token) {
            const userId = Number(account.id)
            lastStorageResult = await saveApiToken(token, {
                authMode: account.authMode,
                authScope: account.authScope,
                authUserId: Number.isFinite(userId) ? userId : undefined,
                authUserName: account.label,
            })
        },
        async clear(ref?: AccountRef) {
            // With `ref`, validate before touching storage so a mismatch is
            // an `ACCOUNT_NOT_FOUND` error rather than a silent
            // ✓ Logged out — the upstream `attachLogoutCommand` treats any
            // non-throwing `clear()` as success.
            if (ref !== undefined) {
                await resolveByRef(ref)
            }
            lastClearResult = await clearApiToken()
        },
        async list() {
            const snapshot = await loadStoredSnapshot()
            return snapshot ? [{ account: snapshot.account, isDefault: true }] : []
        },
        async setDefault(ref: AccountRef) {
            await resolveByRef(ref)
            // Single-user store — already the default once `ref` matches.
        },
        getLastStorageResult() {
            return lastStorageResult
        },
        getLastClearResult() {
            return lastClearResult
        },
    }
}
