import { unlink } from 'node:fs/promises'
import { type AuthMode, type Config, getConfig, getConfigPath, setConfig } from './config.js'
import {
    createSecureStore,
    SECURE_STORE_DESCRIPTION,
    SecureStoreUnavailableError,
} from './secure-store.js'

export const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'
export type TokenStorageLocation = 'secure-store' | 'config-file'

export interface TokenStorageResult {
    storage: TokenStorageLocation
    warning?: string
}

export interface SaveApiTokenOptions {
    authMode?: AuthMode
    authScope?: string
}

export interface AuthMetadata {
    authMode: AuthMode
    authScope?: string
    source: 'env' | 'config'
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
            if (error instanceof SecureStoreUnavailableError) {
                warnSecureStoreFallback('using plaintext token from')
            } else {
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

        throw new Error(
            `No API token found. Set ${TOKEN_ENV_VAR} or run \`tw auth login\` or \`tw auth token <token>\`.`,
        )
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

    throw new Error(
        `No API token found. Set ${TOKEN_ENV_VAR} or run \`tw auth login\` or \`tw auth token <token>\`.`,
    )
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
        source: 'config',
    }
}

export async function saveApiToken(
    token: string,
    options: SaveApiTokenOptions = {},
): Promise<TokenStorageResult> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new Error('Invalid token: Token must be at least 10 characters')
    }

    const trimmedToken = token.trim()
    const secureStore = createSecureStore()

    try {
        await secureStore.setSecret(trimmedToken)
        const existingConfig = await getConfig()
        const warning = await cleanupAuthFallbackState(existingConfig, 'Token was stored securely,')
        // Persist auth metadata to config (best-effort; non-critical if config write fails)
        try {
            await saveAuthMetadata(options)
        } catch {
            // Auth metadata is non-critical — token is already saved in secure store
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
    await writeConfig(config)
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('token saved as plaintext in'),
    }
}

export async function clearApiToken(): Promise<TokenStorageResult> {
    const config = await getConfig()
    const secureStore = createSecureStore()

    // Clear auth metadata from config
    await clearAuthMetadata()

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
    await setConfig(config)
}

async function clearAuthMetadata(): Promise<void> {
    const config = await getConfig()
    delete config.authMode
    delete config.authScope
    await setConfig(config)
}

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

function warnSecureStoreFallback(action: string): void {
    warn(buildFallbackWarning(action))
}
