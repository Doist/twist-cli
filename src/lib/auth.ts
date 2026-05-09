import { unlink } from 'node:fs/promises'
import {
    AccountNotFoundError,
    findAccountByRef,
    getDefaultAccount,
    getStoredAccounts,
    NoAccountSelectedError,
    removeStoredAccount,
    setDefaultAccount as setDefaultAccountInConfig,
    upsertStoredAccount,
} from './accounts.js'
import {
    type AuthMode,
    type Config,
    CONFIG_VERSION,
    getConfig,
    getConfigPath,
    setConfig,
    type StoredAccount,
} from './config.js'
import { CliError } from './errors.js'
import {
    accountForUser,
    createSecureStore,
    LEGACY_ACCOUNT_NAME,
    SECURE_STORE_DESCRIPTION,
    SecureStoreUnavailableError,
} from './secure-store.js'

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

export interface TokenStorageResult {
    storage: TokenStorageLocation
    warning?: string
}

export interface AuthMetadata {
    authMode: AuthMode
    authScope?: string
    source: 'env' | 'secure-store' | 'config-file'
    accountId?: string
    email?: string
}

/**
 * The account whose token will be used for the current command.
 *
 * `id` and `email` are present only for stored v2 accounts. Env-token and
 * legacy v1 fallback flows leave them unset (they don't represent a real
 * account record). Use `source` / the `legacy` flag to distinguish:
 *  - `source: 'env'` — `TWIST_API_TOKEN` is in scope
 *  - `legacy: true` — v1 single-user fallback (no v2 record yet)
 *  - otherwise — a stored v2 account (`id` and `email` are guaranteed)
 */
export interface ResolvedAccount {
    id?: string
    email?: string
    name?: string
    token: string
    authMode: AuthMode
    authScope?: string
    source: AuthMetadata['source']
    legacy?: boolean
}

export interface UpsertAccountInput {
    id: string
    email: string
    name?: string
    token: string
    authMode?: AuthMode
    authScope?: string
}

export interface AuthProbeMetadata {
    authMode: AuthMode
    authScope?: string
    source: 'env' | 'secure-store' | 'config-file'
    accountId?: string
    email?: string
}

export interface AuthProbeResult {
    token: string
    metadata: AuthProbeMetadata
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve which stored account this invocation should act as, and load its
 * token. Honors `--user <ref>`, then `account.defaultAccount`, then a single
 * stored account.
 *
 * Throws `NoAccountSelectedError` when multiple accounts are stored without
 * a default and no `--user` was passed; `AccountNotFoundError` when `--user`
 * does not match; `NoTokenError` when no accounts are stored.
 *
 * `TWIST_API_TOKEN` short-circuits the resolver entirely — env tokens act as
 * an anonymous identity for the duration of the command.
 */
export async function resolveActiveAccount(opts: { ref?: string } = {}): Promise<ResolvedAccount> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return {
            token: envToken,
            authMode: 'unknown',
            source: 'env',
        }
    }

    const config = await getConfig()
    const target = resolveTargetAccount(config, opts.ref)
    if (target.kind === 'legacy') {
        return resolveLegacyToken(config)
    }

    const { token, source } = await loadTokenForStoredAccount(target.account)
    return {
        id: target.account.id,
        email: target.account.email,
        name: target.account.name,
        token,
        authMode: target.account.authMode ?? 'unknown',
        authScope: target.account.authScope,
        source,
    }
}

type TargetAccountResult = { kind: 'stored'; account: StoredAccount } | { kind: 'legacy' }

/**
 * Pick the account record this invocation should act on. Shared between
 * `resolveActiveAccount` (read path) and `clearApiToken` (write path) so the
 * `--user` / default / single-account / legacy fallback rules stay in lockstep.
 *
 * Returns `{ kind: 'legacy' }` only when the config has no `accounts` key at
 * all (a v1-shaped install). An empty `accounts: []` is treated as a clean v2
 * state; callers should surface `NoTokenError` rather than poking the legacy
 * keyring.
 */
function resolveTargetAccount(config: Config, requestedRef?: string): TargetAccountResult {
    const accounts = getStoredAccounts(config)
    const isLegacyShape = !Array.isArray(config.accounts)

    if (accounts.length === 0) {
        if (requestedRef) throw new AccountNotFoundError(requestedRef)
        if (isLegacyShape) return { kind: 'legacy' }
        throw new NoTokenError()
    }

    if (requestedRef) {
        const found = findAccountByRef(config, requestedRef)
        if (!found) throw new AccountNotFoundError(requestedRef)
        return { kind: 'stored', account: found.account }
    }

    const def = getDefaultAccount(config)
    if (def) return { kind: 'stored', account: def }

    if (accounts.length === 1) return { kind: 'stored', account: accounts[0] }
    throw new NoAccountSelectedError()
}

/**
 * Backwards-compatible no-arg accessor for the active account's token.
 * Most call sites only need the bearer string.
 */
export async function getApiToken(): Promise<string> {
    const resolved = await resolveActiveAccount()
    return resolved.token
}

/**
 * Like `resolveActiveAccount` but returns whichever credentials are at hand
 * without mutating storage. Useful for `tw doctor` / `tw config view` where
 * we want to inspect (and report on) what would be used. Lets
 * `SecureStoreUnavailableError` propagate so diagnostics can render the
 * keyring-broken case distinctly from "no credentials".
 */
export async function probeApiToken(): Promise<AuthProbeResult> {
    const resolved = await resolveActiveAccount()
    return { token: resolved.token, metadata: resolvedToMetadata(resolved) }
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    try {
        const resolved = await resolveActiveAccount()
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
 * Add or update a stored account. Stores the token in the OS credential
 * manager under `user-<id>` when available, falls back to per-account
 * plaintext in config. Sets `defaultAccount` automatically when this is the
 * first account being stored.
 */
export async function upsertAccount(
    input: UpsertAccountInput,
): Promise<TokenStorageResult & { replaced: boolean }> {
    if (!input.token || input.token.trim().length < 10) {
        throw new CliError('INVALID_TOKEN', 'Invalid token: Token must be at least 10 characters', [
            'Run: tw auth login',
            'Or set TWIST_API_TOKEN environment variable',
        ])
    }
    if (!input.id) {
        throw new CliError('INVALID_ACCOUNT', 'Cannot store account record: missing id')
    }
    if (!input.email) {
        throw new CliError('INVALID_ACCOUNT', 'Cannot store account record: missing email')
    }

    const trimmedToken = input.token.trim()
    const config = await getConfig()
    const previouslyExisted = getStoredAccounts(config).some((a) => a.id === input.id)
    // Always default the first stored account, even if `account.defaultAccount`
    // points at an orphaned id, so a stale pointer can't wedge resolution.
    const shouldSetDefault = getStoredAccounts(config).length === 0

    const baseRecord: StoredAccount = {
        id: input.id,
        email: input.email,
        name: input.name,
        authMode: input.authMode,
        authScope: input.authScope,
    }

    const secureStore = createSecureStore(accountForUser(input.id))
    let storedSecurely = false
    try {
        await secureStore.setSecret(trimmedToken)
        storedSecurely = true
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    const accountRecord: StoredAccount = storedSecurely
        ? baseRecord
        : { ...baseRecord, token: trimmedToken }

    let next = ensureV2Shape(config)
    next = upsertStoredAccount(next, accountRecord).config
    if (shouldSetDefault) {
        next = setDefaultAccountInConfig(next, input.id)
    }
    next = stripLegacyAuthFields(next)

    try {
        await setConfig(next)
    } catch (error) {
        // Config write is the source of truth — without it, later commands
        // can't resolve a brand-new account even though the keyring holds
        // the secret. For *new* accounts, roll the keyring back so we don't
        // leak a credential nothing references.
        //
        // For an existing account being re-authenticated, the unmodified
        // config still points at the same `user-<id>` slot, so leaving the
        // new token in place keeps the user authenticated — destroying it
        // would be the more damaging outcome of a transient write failure.
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
            `Could not persist account record to ${getConfigPath()}${detail}`,
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
 * Remove the active account (resolved via `--user` or default). For multi-
 * account installs without a default, callers must pass `--user <ref>` to
 * disambiguate.
 */
export async function clearApiToken(opts: { ref?: string } = {}): Promise<TokenStorageResult> {
    const config = await getConfig()
    const target = resolveTargetAccount(config, opts.ref)

    if (target.kind === 'legacy') {
        // `--user <ref>` against a v1-shaped install — we don't know what
        // identity the legacy token represents, so refuse to log it out under
        // the new exact-match contract.
        if (opts.ref) throw new AccountNotFoundError(opts.ref)
        return clearLegacyToken(config)
    }

    return removeAccountById(target.account.id)
}

/**
 * Remove a specific account by id. Used by `tw account remove` and as the
 * primitive for `clearApiToken`.
 *
 * Order matters: write the new config first (the source of truth) and only
 * then delete the secret. If the config update fails the keyring is
 * untouched, so the account remains fully functional and a retry will
 * simply re-attempt the same operation. A keyring delete failure after a
 * successful config update leaves an orphan secret that the keyring's own
 * service can clean up later — the CLI no longer references it.
 */
export async function removeAccountById(id: string): Promise<TokenStorageResult> {
    const config = await getConfig()
    const next = stripLegacyAuthFields(removeStoredAccount(ensureV2Shape(config), id))

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
 * Set the default account, looked up by id or email. Returns the resolved
 * account so callers can show "switched to <email>" without re-resolving.
 */
export async function setDefaultAccountId(ref: string): Promise<StoredAccount> {
    const config = ensureV2Shape(await getConfig())
    const found = findAccountByRef(config, ref)
    if (!found) throw new AccountNotFoundError(ref)
    await setConfig(stripLegacyAuthFields(setDefaultAccountInConfig(config, found.account.id)))
    return found.account
}

export async function listStoredAccounts(): Promise<StoredAccount[]> {
    const config = await getConfig()
    return getStoredAccounts(config)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadTokenForStoredAccount(
    account: StoredAccount,
): Promise<{ token: string; source: 'secure-store' | 'config-file' }> {
    if (account.token?.trim()) {
        return { token: account.token.trim(), source: 'config-file' }
    }
    const secureStore = createSecureStore(accountForUser(account.id))
    // Re-throw `SecureStoreUnavailableError` rather than collapsing it into
    // `NoTokenError`. A stored v2 account with the keyring offline is *not*
    // the same situation as no credentials at all — diagnostic commands
    // should report the keyring failure rather than say the account has no
    // saved credentials.
    const stored = await secureStore.getSecret()
    if (stored?.trim()) {
        return { token: stored.trim(), source: 'secure-store' }
    }
    throw new NoTokenError()
}

/**
 * v1 fallback: when there are no v2 accounts in the config, see if a legacy
 * single-user token is present (config plaintext or legacy `api-token`
 * keyring entry). Returns it as a synthetic ResolvedAccount so the CLI
 * keeps working until postinstall (or `tw auth login`) migrates the install.
 */
async function resolveLegacyToken(config: Config): Promise<ResolvedAccount> {
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
            await writeConfig(cleaned)
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
        await writeConfig(cleared)
    } catch {
        // best effort
    }
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

async function writeConfig(config: Config): Promise<void> {
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
    const next: Config = { ...config, configVersion: CONFIG_VERSION }
    if (!Array.isArray(next.accounts)) {
        next.accounts = []
    }
    return next
}

function stripLegacyAuthFields(config: Config): Config {
    const { token: _t, authMode: _m, authScope: _s, pendingSecureStoreClear: _p, ...rest } = config
    return rest
}

function resolvedToMetadata(resolved: ResolvedAccount): AuthMetadata {
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
