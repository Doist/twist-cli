import { unlink } from 'node:fs/promises'
import { type AuthMode, type Config, getConfig, getConfigPath, setConfig } from './config.js'
import { CliError } from './errors.js'
import {
    createSecureStore,
    SECURE_STORE_DESCRIPTION,
    SecureStoreUnavailableError,
} from './secure-store.js'

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

export const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'
export type TokenStorageLocation = 'secure-store' | 'config-file'

export interface TokenStorageResult {
    storage: TokenStorageLocation
    warning?: string
}

export interface SaveApiTokenOptions {
    authMode?: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
}

export interface AuthMetadata {
    authMode: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
    source: 'env' | 'config'
}

export interface AuthProbeMetadata {
    authMode: AuthMode
    authScope?: string
    authUserId?: number
    authUserName?: string
    source: 'env' | 'config-file' | 'secure-store'
}

export interface AuthProbeResult {
    token: string
    metadata: AuthProbeMetadata
}

export async function getApiToken(): Promise<string> {
    // Priority 1: Environment variable
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return envToken
    }

    const config = await getConfig()
    const configToken = getConfigToken(config)
    const secureStore = createSecureStore()

    if (configToken) {
        try {
            await secureStore.setSecret(configToken)
            const cleanupWarning = await cleanupAuthFallbackState(
                config,
                'Token was migrated to secure storage,',
            )
            if (cleanupWarning) {
                warn(cleanupWarning)
            }
        } catch (error) {
            if (!(error instanceof SecureStoreUnavailableError)) {
                throw error
            }
        }

        return configToken
    }

    if (config.pendingSecureStoreClear) {
        try {
            await secureStore.deleteSecret()
            const cleanupWarning = await cleanupAuthFallbackState(
                config,
                'Secure-store token was removed,',
            )
            if (cleanupWarning) {
                warn(cleanupWarning)
            }
        } catch (error) {
            if (!(error instanceof SecureStoreUnavailableError)) {
                throw error
            }
        }

        throw new NoTokenError()
    }

    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return storedToken
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    throw new NoTokenError()
}

export async function probeApiToken(): Promise<AuthProbeResult> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return {
            token: envToken,
            metadata: { authMode: 'unknown', source: 'env' },
        }
    }

    const config = await getConfig()
    const configToken = getConfigToken(config)
    if (configToken) {
        return {
            token: configToken,
            metadata: {
                authMode: config.authMode ?? 'unknown',
                authScope: config.authScope,
                authUserId: config.authUserId,
                authUserName: config.authUserName,
                source: 'config-file',
            },
        }
    }

    if (config.pendingSecureStoreClear) {
        throw new NoTokenError()
    }

    const secureStore = createSecureStore()
    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return {
                token: storedToken.trim(),
                metadata: {
                    authMode: config.authMode ?? 'unknown',
                    authScope: config.authScope,
                    authUserId: config.authUserId,
                    authUserName: config.authUserName,
                    source: 'secure-store',
                },
            }
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
        throw error
    }

    throw new NoTokenError()
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return { authMode: 'unknown', source: 'env' }
    }

    const config = await getConfig()
    return {
        authMode: config.authMode ?? 'unknown',
        authScope: config.authScope,
        authUserId: config.authUserId,
        authUserName: config.authUserName,
        source: 'config',
    }
}

export async function saveApiToken(
    token: string,
    options: SaveApiTokenOptions = {},
): Promise<TokenStorageResult> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new CliError('INVALID_TOKEN', 'Invalid token: Token must be at least 10 characters', [
            'Run: tw auth login',
            'Or set TWIST_API_TOKEN environment variable',
        ])
    }

    const trimmedToken = token.trim()
    const secureStore = createSecureStore()

    try {
        await secureStore.setSecret(trimmedToken)
        const existingConfig = await getConfig()
        const warning = await cleanupAuthFallbackState(existingConfig, 'Token was stored securely,')
        // Persist auth metadata to config — needed for ensureWriteAllowed() enforcement
        try {
            await saveAuthMetadata(options)
        } catch {
            if (options.authMode && options.authMode !== 'unknown') {
                warn(
                    `Could not persist auth mode '${options.authMode}' to config. CLI-side write protection may not work in future sessions.`,
                )
            }
        }
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    const config = await getConfig()
    config.token = trimmedToken
    delete config.pendingSecureStoreClear
    config.authMode = options.authMode ?? 'unknown'
    config.authScope = options.authScope
    config.authUserId = options.authUserId
    config.authUserName = options.authUserName
    await writeConfig(config)
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('token saved as plaintext in'),
    }
}

export async function clearApiToken(): Promise<TokenStorageResult> {
    const config = await getConfig()
    const secureStore = createSecureStore()

    // Clear auth metadata from the in-memory config object so all subsequent
    // writes (cleanupAuthFallbackState, withPendingSecureStoreClear) persist
    // the removal atomically alongside other state changes.
    delete config.authMode
    delete config.authScope
    delete config.authUserId
    delete config.authUserName

    try {
        await secureStore.deleteSecret()
        const warning = await cleanupAuthFallbackState(config, 'Secure-store token was removed,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    await writeConfig(withPendingSecureStoreClear(config))
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

async function saveAuthMetadata(options: SaveApiTokenOptions): Promise<void> {
    const config = await getConfig()
    config.authMode = options.authMode ?? 'unknown'
    config.authScope = options.authScope
    config.authUserId = options.authUserId
    config.authUserName = options.authUserName
    await setConfig(config)
}

/**
 * Auth-local cousin of `setConfig` that deletes the file when the resulting
 * config has no own keys. The public `setConfig` always serializes (even
 * `{}`) — this wrapper exists for the auth flows that strip the legacy
 * plaintext token and want to leave nothing behind.
 */
async function writeConfig(config: Config): Promise<void> {
    if (Object.keys(config).length === 0) {
        try {
            await unlink(getConfigPath())
        } catch (error) {
            if (!isMissingFileError(error)) {
                throw error
            }
        }
        return
    }

    await setConfig(config)
}

async function cleanupAuthFallbackState(
    config: Config,
    warningPrefix: string,
): Promise<string | undefined> {
    try {
        await writeConfig(withoutAuthFallbackState(config))
        return undefined
    } catch (error) {
        return buildConfigCleanupWarning(warningPrefix, error)
    }
}

function getConfigToken(config: Config): string | null {
    return typeof config.token === 'string' && config.token.trim() ? config.token.trim() : null
}

function withoutAuthFallbackState(config: Config): Config {
    const { token: _token, pendingSecureStoreClear: _pending, ...rest } = config
    return rest
}

function withPendingSecureStoreClear(config: Config): Config {
    return { ...withoutAuthFallbackState(config), pendingSecureStoreClear: true }
}

function buildFallbackWarning(action: string): string {
    return `${SECURE_STORE_DESCRIPTION} unavailable; ${action} ${getConfigPath()}`
}

function buildConfigCleanupWarning(prefix: string, error: unknown): string {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return `${prefix} but could not remove legacy plaintext token from ${getConfigPath()}${detail}`
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function warn(message: string): void {
    console.error(`Warning: ${message}`)
}
