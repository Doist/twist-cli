import { unlink } from 'node:fs/promises'
import {
    type AuthMode,
    type Config,
    CONFIG_VERSION,
    getConfig,
    getConfigPath,
    setConfig,
    type StoredUser,
} from './config.js'
import { CliError } from './errors.js'
import {
    accountForUser,
    createSecureStore,
    LEGACY_ACCOUNT_NAME,
    SECURE_STORE_DESCRIPTION,
    SecureStoreUnavailableError,
} from './secure-store.js'
import {
    AccountNotFoundError,
    findUserByRef,
    getDefaultUser,
    getStoredUsers,
    NoAccountSelectedError,
    removeStoredUser,
    setDefaultUser as setDefaultUserInConfig,
    upsertStoredUser,
} from './users.js'

export const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

export class NoTokenError extends CliError {
    constructor() {
        super(
            'NO_TOKEN',
            `No API token found. Set ${TOKEN_ENV_VAR} or run \`tw auth login\` or \`tw auth token <token>\`.`,
            ['Set TWIST_API_TOKEN or run: tw auth login'],
            'info',
        )
        this.name = 'NoTokenError'
    }
}

export type TokenStorageLocation = 'secure-store' | 'config-file'

export type TokenStorageResult = {
    storage: TokenStorageLocation
    warning?: string
}

export type AuthMetadata = {
    authMode: AuthMode
    authScope?: string
    source: 'env' | 'secure-store' | 'config-file'
    accountId?: string
    email?: string
}

/**
 * The user whose token will be used for the current command.
 *
 * `id` and `email` are present only for stored v2 users. Env-token and
 * legacy v1 fallback flows leave them unset (they don't represent a real
 * stored record). Use `source` / the `legacy` flag to distinguish:
 *  - `source: 'env'` — `TWIST_API_TOKEN` is in scope
 *  - `legacy: true` — v1 single-user fallback (no v2 record yet)
 *  - otherwise — a stored v2 user (`id` and `email` are guaranteed)
 */
export type ResolvedUser = {
    id?: string
    email?: string
    name?: string
    token: string
    authMode: AuthMode
    authScope?: string
    source: AuthMetadata['source']
    legacy?: boolean
}

export type UpsertUserInput = {
    id: string
    email: string
    name?: string
    token: string
    authMode?: AuthMode
    authScope?: string
}

export type AuthProbeMetadata = AuthMetadata

export type AuthProbeResult = {
    token: string
    metadata: AuthProbeMetadata
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve which stored user this invocation should act as, and load its
 * token. Honors `--user <ref>`, then `user.default_user`, then a single
 * stored user.
 *
 * Throws `NoAccountSelectedError` when multiple users are stored without
 * a default and no `--user` was passed; `AccountNotFoundError` when
 * `--user` does not match; `NoTokenError` when no users are stored.
 *
 * `TWIST_API_TOKEN` short-circuits the resolver entirely — env tokens act
 * as an anonymous identity for the duration of the command.
 */
export async function resolveActiveUser(opts: { ref?: string } = {}): Promise<ResolvedUser> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return {
            token: envToken,
            authMode: 'unknown',
            source: 'env',
        }
    }

    const config = await getConfig()
    const target = resolveTargetUser(config, opts.ref)
    if (target.kind === 'legacy') {
        return resolveLegacyToken(config)
    }

    const { token, source } = await loadTokenForStoredUser(target.user)
    return {
        id: target.user.id,
        email: target.user.email,
        name: target.user.name,
        token,
        authMode: target.user.auth_mode ?? 'unknown',
        authScope: target.user.auth_scope,
        source,
    }
}

type TargetUserResult = { kind: 'stored'; user: StoredUser } | { kind: 'legacy' }

/**
 * Pick the user record this invocation should act on. Shared between
 * `resolveActiveUser` (read path) and `clearApiToken` (write path) so the
 * `--user` / default / single-user / legacy fallback rules stay in lockstep.
 *
 * Returns `{ kind: 'legacy' }` only when the config has no `users` key at
 * all (a v1-shaped install). An empty `users: []` is treated as a clean v2
 * state; callers should surface `NoTokenError` rather than poking the
 * legacy keyring.
 */
function resolveTargetUser(config: Config, requestedRef?: string): TargetUserResult {
    const users = getStoredUsers(config)
    const isLegacyShape = !Array.isArray(config.users)

    if (users.length === 0) {
        if (requestedRef) throw new AccountNotFoundError(requestedRef)
        if (isLegacyShape) return { kind: 'legacy' }
        throw new NoTokenError()
    }

    if (requestedRef) {
        const found = findUserByRef(config, requestedRef)
        if (!found) throw new AccountNotFoundError(requestedRef)
        return { kind: 'stored', user: found.user }
    }

    const def = getDefaultUser(config)
    if (def) return { kind: 'stored', user: def }

    if (users.length === 1) return { kind: 'stored', user: users[0] }
    throw new NoAccountSelectedError()
}

/**
 * Backwards-compatible no-arg accessor for the active user's token.
 * Most call sites only need the bearer string.
 */
export async function getApiToken(): Promise<string> {
    const resolved = await resolveActiveUser()
    return resolved.token
}

/**
 * Like `resolveActiveUser` but returns whichever credentials are at hand
 * without mutating storage. Useful for `tw doctor` / `tw config view`
 * where we want to inspect (and report on) what would be used. Lets
 * `SecureStoreUnavailableError` propagate so diagnostics can render the
 * keyring-broken case distinctly from "no credentials".
 */
export async function probeApiToken(): Promise<AuthProbeResult> {
    const resolved = await resolveActiveUser()
    return { token: resolved.token, metadata: resolvedToMetadata(resolved) }
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    try {
        const resolved = await resolveActiveUser()
        return resolvedToMetadata(resolved)
    } catch (error) {
        // Metadata callers (e.g. permission checks) need a sensible default
        // rather than a hard failure when credentials are missing or the
        // keyring is offline. Diagnostic commands use `probeApiToken` for
        // that — it intentionally lets `SecureStoreUnavailableError`
        // propagate so it can be reported.
        if (error instanceof NoTokenError || error instanceof SecureStoreUnavailableError) {
            return { authMode: 'unknown', source: 'secure-store' }
        }
        throw error
    }
}

/**
 * Add or update a stored user. Stores the token in the OS credential
 * manager under `user-<id>` when available, falls back to per-user
 * plaintext in config. Sets `default_user` automatically when this is the
 * first user being stored.
 */
export async function upsertUser(
    input: UpsertUserInput,
): Promise<TokenStorageResult & { replaced: boolean }> {
    if (!input.token || input.token.trim().length < 10) {
        throw new CliError('INVALID_TOKEN', 'Invalid token: Token must be at least 10 characters', [
            'Run: tw auth login',
            'Or set TWIST_API_TOKEN environment variable',
        ])
    }
    if (!input.id) {
        throw new CliError('INVALID_ACCOUNT', 'Cannot store user record: missing id')
    }
    if (!input.email) {
        throw new CliError('INVALID_ACCOUNT', 'Cannot store user record: missing email')
    }

    const trimmedToken = input.token.trim()
    const config = await getConfig()
    const previouslyExisted = getStoredUsers(config).some((u) => u.id === input.id)
    // Always default the first stored user, even if `user.default_user`
    // points at an orphaned id, so a stale pointer can't wedge resolution.
    const shouldSetDefault = getStoredUsers(config).length === 0

    const baseRecord: StoredUser = {
        id: input.id,
        email: input.email,
        name: input.name,
        auth_mode: input.authMode,
        auth_scope: input.authScope,
    }

    const secureStore = createSecureStore(accountForUser(input.id))
    let storedSecurely = false
    try {
        await secureStore.setSecret(trimmedToken)
        storedSecurely = true
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    const userRecord: StoredUser = storedSecurely
        ? baseRecord
        : { ...baseRecord, api_token: trimmedToken }

    let next = ensureV2Shape(config)
    next = upsertStoredUser(next, userRecord).config
    if (shouldSetDefault) {
        next = setDefaultUserInConfig(next, input.id)
    }
    next = stripLegacyAuthFields(next)

    try {
        await setConfig(next)
    } catch (error) {
        // Config write is the source of truth — without it, later commands
        // can't resolve a brand-new user even though the keyring holds the
        // secret. For *new* users, roll the keyring back so we don't leak
        // a credential nothing references.
        //
        // For an existing user being re-authenticated, the unmodified
        // config still points at the same `user-<id>` slot, so leaving
        // the new token in place keeps the user authenticated —
        // destroying it would be the more damaging outcome of a transient
        // write failure.
        if (storedSecurely && !previouslyExisted) {
            try {
                await secureStore.deleteSecret()
            } catch {
                // best effort — original error is what the user needs
            }
        }
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
        throw new CliError(
            'CONFIG_WRITE_FAILED',
            `Could not persist user record to ${getConfigPath()}${detail}`,
            ['Check file permissions on ~/.config/twist-cli/, then re-run the command'],
        )
    }

    return {
        storage: storedSecurely ? 'secure-store' : 'config-file',
        warning: storedSecurely ? undefined : buildFallbackWarning('token saved as plaintext in'),
        replaced: previouslyExisted,
    }
}

/**
 * Remove the active user (resolved via `--user` or default). For multi-user
 * installs without a default, callers must pass `--user <ref>` to
 * disambiguate.
 */
export async function clearApiToken(opts: { ref?: string } = {}): Promise<TokenStorageResult> {
    const config = await getConfig()
    const target = resolveTargetUser(config, opts.ref)

    if (target.kind === 'legacy') {
        // `--user <ref>` against a v1-shaped install — we don't know what
        // identity the legacy token represents, so refuse to log it out
        // under the new exact-match contract.
        if (opts.ref) throw new AccountNotFoundError(opts.ref)
        return clearLegacyToken(config)
    }

    return removeUserById(target.user.id)
}

/**
 * Remove a specific user by id. Used by `tw account remove` and as the
 * primitive for `clearApiToken`.
 *
 * Order matters: write the new config first (the source of truth) and
 * only then delete the secret. If the config update fails the keyring is
 * untouched, so the user remains fully functional and a retry will simply
 * re-attempt the same operation. A keyring delete failure after a
 * successful config update leaves an orphan secret that the keyring's own
 * service can clean up later — the CLI no longer references it.
 */
export async function removeUserById(id: string): Promise<TokenStorageResult> {
    const config = await getConfig()
    const next = stripLegacyAuthFields(removeStoredUser(ensureV2Shape(config), id))

    try {
        await setConfig(next)
    } catch (error) {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
        throw new CliError('CONFIG_WRITE_FAILED', `Could not update ${getConfigPath()}${detail}`, [
            'Check file permissions on ~/.config/twist-cli/, then re-run the command',
        ])
    }

    const secureStore = createSecureStore(accountForUser(id))
    try {
        await secureStore.deleteSecret()
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
        return {
            storage: 'config-file',
            warning: buildFallbackWarning('local auth state cleared in'),
        }
    }

    return { storage: 'secure-store' }
}

/**
 * Set the default user, looked up by id or email. Returns the resolved
 * user so callers can show "switched to <email>" without re-resolving.
 */
export async function setDefaultUserId(ref: string): Promise<StoredUser> {
    const config = ensureV2Shape(await getConfig())
    const found = findUserByRef(config, ref)
    if (!found) throw new AccountNotFoundError(ref)
    await setConfig(stripLegacyAuthFields(setDefaultUserInConfig(config, found.user.id)))
    return found.user
}

export async function listStoredUsers(): Promise<StoredUser[]> {
    const config = await getConfig()
    return getStoredUsers(config)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadTokenForStoredUser(
    user: StoredUser,
): Promise<{ token: string; source: 'secure-store' | 'config-file' }> {
    if (user.api_token?.trim()) {
        return { token: user.api_token.trim(), source: 'config-file' }
    }
    const secureStore = createSecureStore(accountForUser(user.id))
    // Re-throw `SecureStoreUnavailableError` rather than collapsing it into
    // `NoTokenError`. A stored v2 user with the keyring offline is *not*
    // the same situation as no credentials at all — diagnostic commands
    // should report the keyring failure rather than say the user has no
    // saved credentials.
    const stored = await secureStore.getSecret()
    if (stored?.trim()) {
        return { token: stored.trim(), source: 'secure-store' }
    }
    throw new NoTokenError()
}

/**
 * v1 fallback: when there are no v2 users in the config, see if a legacy
 * single-user token is present (config plaintext or legacy `api-token`
 * keyring entry). Returns it as a synthetic ResolvedUser so the CLI
 * keeps working until postinstall (or `tw auth login`) migrates the
 * install.
 */
async function resolveLegacyToken(config: Config): Promise<ResolvedUser> {
    const legacyToken = typeof config.token === 'string' ? config.token.trim() : ''
    if (legacyToken) {
        return {
            token: legacyToken,
            authMode: config.authMode ?? 'unknown',
            authScope: config.authScope,
            source: 'config-file',
            legacy: true,
        }
    }

    if (config.pendingSecureStoreClear) {
        // v1 logout state: nothing to restore.
        throw new NoTokenError()
    }

    const secureStore = createSecureStore(LEGACY_ACCOUNT_NAME)
    try {
        const stored = await secureStore.getSecret()
        if (stored?.trim()) {
            return {
                token: stored.trim(),
                authMode: config.authMode ?? 'unknown',
                authScope: config.authScope,
                source: 'secure-store',
                legacy: true,
            }
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    throw new NoTokenError()
}

async function clearLegacyToken(config: Config): Promise<TokenStorageResult> {
    const secureStore = createSecureStore(LEGACY_ACCOUNT_NAME)

    try {
        await secureStore.deleteSecret()
        const cleaned = stripLegacyAuthFields(config)
        try {
            await writeConfigOrUnlink(cleaned)
        } catch (error) {
            return {
                storage: 'secure-store',
                warning: buildConfigCleanupWarning('Secure-store token was removed,', error),
            }
        }
        return { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    const cleared: Config = {
        ...stripLegacyAuthFields(config),
        pendingSecureStoreClear: true,
    }
    try {
        await writeConfigOrUnlink(cleared)
    } catch {
        // best effort
    }
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

/**
 * Auth-local cousin of `setConfig` that deletes the file when the resulting
 * config has no own keys. The public `setConfig` always serializes (even
 * `{}`) — this wrapper exists for the auth flows that strip the legacy
 * plaintext token and want to leave nothing behind.
 */
async function writeConfigOrUnlink(config: Config): Promise<void> {
    if (Object.keys(config).length === 0) {
        try {
            await unlink(getConfigPath())
        } catch (error) {
            if (!isMissingFileError(error)) throw error
        }
        return
    }
    await setConfig(config)
}

function ensureV2Shape(config: Config): Config {
    const next: Config = { ...config, config_version: CONFIG_VERSION }
    if (!Array.isArray(next.users)) {
        next.users = []
    }
    return next
}

function stripLegacyAuthFields(config: Config): Config {
    const {
        token: _t,
        authMode: _m,
        authScope: _s,
        pendingSecureStoreClear: _p,
        currentWorkspace: _w,
        ...rest
    } = config
    return rest
}

function resolvedToMetadata(resolved: ResolvedUser): AuthMetadata {
    return {
        authMode: resolved.authMode,
        authScope: resolved.authScope,
        source: resolved.source,
        accountId: resolved.id,
        email: resolved.email,
    }
}

function buildFallbackWarning(action: string): string {
    return `${SECURE_STORE_DESCRIPTION} unavailable; ${action} ${getConfigPath()}`
}

function buildConfigCleanupWarning(prefix: string, error: unknown): string {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return `${prefix} but could not update ${getConfigPath()}${detail}`
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
