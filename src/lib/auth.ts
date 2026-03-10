import { unlink } from 'node:fs/promises'
import { type Config, getConfig, getConfigPath, setConfig } from './config.js'
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

export async function getApiToken(): Promise<string> {
    // Priority 1: Environment variable
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return envToken
    }

    const secureStore = createSecureStore()
    let secureStoreAvailable = true

    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return storedToken
        }
    } catch (error) {
        if (error instanceof SecureStoreUnavailableError) {
            secureStoreAvailable = false
        } else {
            throw error
        }
    }

    const config = await getConfig()
    const configToken = getConfigToken(config)
    if (configToken) {
        if (secureStoreAvailable) {
            try {
                await secureStore.setSecret(configToken)
                const cleanupWarning = await cleanupPlaintextToken(
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
        } else {
            warnSecureStoreFallback('using plaintext token from')
        }

        return configToken
    }

    throw new Error(
        `No API token found. Set ${TOKEN_ENV_VAR} or run \`tw auth login\` or \`tw auth token <token>\`.`,
    )
}

export async function saveApiToken(token: string): Promise<TokenStorageResult> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new Error('Invalid token: Token must be at least 10 characters')
    }

    const trimmedToken = token.trim()
    const secureStore = createSecureStore()

    try {
        await secureStore.setSecret(trimmedToken)
        const existingConfig = await getConfig()
        const warning = await cleanupPlaintextToken(existingConfig, 'Token was stored securely,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    const config = await getConfig()
    config.token = trimmedToken
    await writeConfig(config)
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('token saved as plaintext in'),
    }
}

export async function clearApiToken(): Promise<TokenStorageResult> {
    const config = await getConfig()
    const secureStore = createSecureStore()

    try {
        await secureStore.deleteSecret()
        const warning = await cleanupPlaintextToken(config, 'Secure-store token was removed,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    await writeConfig(withoutToken(config))
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('token removed from'),
    }
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

async function cleanupPlaintextToken(
    config: Config,
    warningPrefix: string,
): Promise<string | undefined> {
    try {
        await writeConfig(withoutToken(config))
        return undefined
    } catch (error) {
        return buildConfigCleanupWarning(warningPrefix, error)
    }
}

function getConfigToken(config: Config): string | null {
    return typeof config.token === 'string' && config.token.trim() ? config.token.trim() : null
}

function withoutToken(config: Config): Config {
    const { token: _token, ...rest } = config
    return rest
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
