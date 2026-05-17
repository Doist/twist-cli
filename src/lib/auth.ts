import { SecureStoreUnavailableError } from '@doist/cli-core/auth'
import { createTwistTokenStore } from './auth-provider.js'
import type { AuthMode } from './config.js'
import { CliError } from './errors.js'
import { createTwistUserRecordStore } from './user-records.js'

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
 * Read the token used for live API calls. Env var beats stored token so
 * `TWIST_API_TOKEN=… tw …` always wins; otherwise the cli-core keyring store
 * is consulted via the shared `TwistTokenStore`. Throws `NoTokenError` when
 * nothing resolves.
 */
export async function getApiToken(): Promise<string> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) return envToken
    const snapshot = await createTwistTokenStore().active()
    if (!snapshot) throw new NoTokenError()
    return snapshot.token
}

/**
 * Token + metadata in one round-trip for callers that need to render
 * provenance (`tw config view`, `tw doctor`). The `source` field is derived
 * by peeking at the `UserRecordStore` directly: a present `fallbackToken`
 * means the keyring was unavailable at write time and the plaintext copy is
 * being read; an absent one means the keyring slot was the source.
 */
export async function probeApiToken(): Promise<AuthProbeResult> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return { token: envToken, metadata: { authMode: 'unknown', source: 'env' } }
    }
    const snapshot = await createTwistTokenStore().active()
    if (!snapshot) throw new NoTokenError()

    const records = await createTwistUserRecordStore().list()
    const record =
        records.find((r) => r.account.id === snapshot.account.id) ?? records[0] ?? undefined
    const source: AuthProbeMetadata['source'] = record?.fallbackToken
        ? 'config-file'
        : 'secure-store'

    return {
        token: snapshot.token,
        metadata: {
            authMode: snapshot.account.authMode,
            authScope: snapshot.account.authScope || undefined,
            authUserId: snapshot.account.id ? toAuthUserId(snapshot.account.id) : undefined,
            authUserName: snapshot.account.label || undefined,
            source,
        },
    }
}

/**
 * Lightweight metadata read used by `tw auth status` once a token is already
 * confirmed via the store. Returns `source: 'env'` when the env var is set;
 * otherwise pulls the persisted identity straight from the record store
 * (skipping the keyring read `probeApiToken` does).
 */
export async function getAuthMetadata(): Promise<AuthMetadata> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) return { authMode: 'unknown', source: 'env' }

    const [record] = await createTwistUserRecordStore().list()
    if (!record) return { authMode: 'unknown', source: 'config' }

    return {
        authMode: record.account.authMode,
        authScope: record.account.authScope || undefined,
        authUserId: record.account.id ? toAuthUserId(record.account.id) : undefined,
        authUserName: record.account.label || undefined,
        source: 'config',
    }
}

function toAuthUserId(id: string): number | undefined {
    const num = Number(id)
    return Number.isFinite(num) && num > 0 ? num : undefined
}
