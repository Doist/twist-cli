import { SecureStoreUnavailableError } from '@doist/cli-core/auth'
import type { TwistAccount } from './auth-provider.js'
import { createTwistTokenStore, getActiveTokenSource } from './auth-provider.js'
import { type AuthMode, getConfig } from './config.js'
import { CliError } from './errors.js'
import { getDefaultUserRecord } from './user-records.js'

export { SecureStoreUnavailableError }

export const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

export const SECURE_STORE_DESCRIPTION = 'system credential manager'

export type TokenStorageLocation = 'secure-store' | 'config-file'

export type TokenStorageResult = {
    storage: TokenStorageLocation
    warning?: string
}

export type AuthMetadata = {
    authMode: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
    source: 'env' | 'config'
}

export type AuthProbeMetadata = {
    authMode: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
    source: 'env' | 'config-file' | 'secure-store'
}

export type AuthProbeResult = {
    token: string
    metadata: AuthProbeMetadata
}

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

/**
 * Read the token used for live API calls. The store wraps `active()` with
 * env-var precedence (see `createTwistTokenStore`), so a single delegated
 * read covers both `TWIST_API_TOKEN=… tw …` and stored-credential cases.
 */
export async function getApiToken(): Promise<string> {
    const snapshot = await createTwistTokenStore().active()
    if (!snapshot) throw new NoTokenError()
    return snapshot.token
}

/** Token + metadata in one round-trip for `tw config view` / `tw doctor`. */
export async function probeApiToken(): Promise<AuthProbeResult> {
    const snapshot = await createTwistTokenStore().active()
    if (!snapshot) throw new NoTokenError()
    const source = await getActiveTokenSource()
    return {
        token: snapshot.token,
        metadata:
            source === 'env'
                ? { authMode: 'unknown', source: 'env' }
                : { ...toAccountFields(snapshot.account), source },
    }
}

/**
 * Lightweight metadata read used by `tw auth status` and `ensureWriteAllowed`.
 * Falls back to the v1 flat fields when no v2 record exists yet so a legacy
 * `read-only` token isn't reported as `'unknown'` during the post-upgrade
 * offline window — that would let mutating commands slip past the local
 * READ_ONLY guard until migration completes.
 */
export async function getAuthMetadata(): Promise<AuthMetadata> {
    if (process.env[TOKEN_ENV_VAR]) return { authMode: 'unknown', source: 'env' }
    const config = await getConfig()
    const record = getDefaultUserRecord(config)
    if (record) return { ...toAccountFields(record.account), source: 'config' }
    if (config.token?.trim() || config.authUserId !== undefined || config.authMode) {
        return {
            authMode: config.authMode ?? 'unknown',
            authScope: config.authScope,
            authUserId: config.authUserId,
            authUserName: config.authUserName,
            source: 'config',
        }
    }
    return { authMode: 'unknown', source: 'config' }
}

function toAccountFields(account: TwistAccount): {
    authMode: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
} {
    return {
        authMode: account.authMode,
        authScope: account.authScope || undefined,
        authUserId: account.id ? toAuthUserId(account.id) : undefined,
        authUserName: account.label || undefined,
    }
}

function toAuthUserId(id: string): number | undefined {
    const num = Number(id)
    return Number.isFinite(num) && num > 0 ? num : undefined
}
