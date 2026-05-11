/**
 * One-time migration of v1 single-user auth state into the v2 multi-user
 * shape. Invoked from `src/postinstall.ts` so existing installs upgrade
 * transparently. Best-effort: any failure (offline, invalid token, keyring
 * unavailable) leaves the v1 state untouched so the runtime fallback in
 * `resolveActiveUser` can keep serving the legacy token until the next
 * upgrade attempt or `tw auth login`.
 */

import { type Config, CONFIG_VERSION, getConfig, setConfig, type StoredUser } from './config.js'
import {
    accountForUser,
    createSecureStore,
    LEGACY_ACCOUNT_NAME,
    SecureStoreUnavailableError,
} from './secure-store.js'

export type MigrateAuthResult = {
    status: 'already-migrated' | 'no-legacy-state' | 'migrated' | 'skipped'
    reason?: string
    migratedUserId?: string
    migratedEmail?: string
}

type MigrateOptions = {
    /** Suppress console output. Postinstall sets this; CLI surfaces use it via warn(). */
    silent?: boolean
    /** Override fetch (for tests). */
    fetchImpl?: typeof fetch
}

type SessionUser = {
    id: string
    email: string
    name?: string
}

const SESSION_ENDPOINT = 'https://api.twist.com/api/v3/users/get_session_user'

export async function migrateLegacyAuth(opts: MigrateOptions = {}): Promise<MigrateAuthResult> {
    const fetchImpl = opts.fetchImpl ?? fetch
    const config = await getConfig()

    // Already on v2 — the presence of `users` is the marker. Empty array
    // still counts as migrated (clean slate after a logout).
    if (Array.isArray(config.users)) {
        return { status: 'already-migrated' }
    }

    const legacyToken = await loadLegacyToken(config)
    if (!legacyToken) {
        // No usable token to migrate. If there's nothing legacy at all, exit
        // without writing the file. Otherwise clean up to v2 shape.
        if (
            config.token === undefined &&
            config.authMode === undefined &&
            config.authScope === undefined &&
            !config.pendingSecureStoreClear
        ) {
            return { status: 'no-legacy-state' }
        }

        try {
            await setConfig(toV2(stripLegacy(config), []))
        } catch (error) {
            return skipped(opts, `failed to clean up legacy config (${describe(error)})`)
        }
        return { status: 'migrated' }
    }

    // Identify the user behind the legacy token via a one-shot REST call —
    // no SDK import to keep postinstall lightweight.
    let user: SessionUser
    try {
        user = await fetchSessionUser(legacyToken, fetchImpl)
    } catch (error) {
        return skipped(opts, `could not identify Twist user (${describe(error)})`)
    }

    const record: StoredUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        auth_mode: config.authMode,
        auth_scope: config.authScope,
    }

    // Move the token into the per-user keyring slot.
    let storedSecurely = false
    try {
        const userStore = createSecureStore(accountForUser(user.id))
        await userStore.setSecret(legacyToken)
        storedSecurely = true
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            return skipped(opts, `failed to write user-scoped credential (${describe(error)})`)
        }
    }

    if (!storedSecurely) {
        record.api_token = legacyToken
    }

    const next = toV2(stripLegacy(config), [record], user.id)

    try {
        await setConfig(next)
    } catch (error) {
        return skipped(opts, `failed to update config (${describe(error)})`)
    }

    // Clean up the legacy keyring entry — best effort, never fatal.
    try {
        const legacyStore = createSecureStore(LEGACY_ACCOUNT_NAME)
        await legacyStore.deleteSecret()
    } catch {
        // ignore
    }

    if (!opts.silent) {
        console.error(`twist-cli: migrated existing token to multi-user store (${user.email}).`)
    }

    return { status: 'migrated', migratedUserId: user.id, migratedEmail: user.email }
}

async function loadLegacyToken(config: Config): Promise<string | null> {
    if (typeof config.token === 'string' && config.token.trim()) {
        return config.token.trim()
    }
    try {
        const legacyStore = createSecureStore(LEGACY_ACCOUNT_NAME)
        const stored = await legacyStore.getSecret()
        if (stored?.trim()) return stored.trim()
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }
    return null
}

async function fetchSessionUser(token: string, fetchImpl: typeof fetch): Promise<SessionUser> {
    const response = await fetchImpl(SESSION_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { id?: unknown; email?: unknown; name?: unknown }
    if (data.id === undefined || data.id === null) {
        throw new Error('response missing user id')
    }
    if (typeof data.email !== 'string' || !data.email) {
        throw new Error('response missing user email')
    }
    return {
        id: String(data.id),
        email: data.email,
        name: typeof data.name === 'string' ? data.name : undefined,
    }
}

function toV2(config: Config, users: StoredUser[], defaultUserId?: string): Config {
    const next: Config = { ...config, config_version: CONFIG_VERSION, users }
    if (defaultUserId) {
        next.user = { ...next.user, default_user: defaultUserId }
    }
    return next
}

function stripLegacy(config: Config): Config {
    const { token: _t, authMode: _m, authScope: _s, pendingSecureStoreClear: _p, ...rest } = config
    return rest
}

function describe(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error)
}

function skipped(opts: MigrateOptions, reason: string): MigrateAuthResult {
    if (!opts.silent) {
        console.error(`twist-cli: skipped legacy auth migration — ${reason}.`)
    }
    return { status: 'skipped', reason }
}
