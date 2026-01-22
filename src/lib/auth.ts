import { unlink } from 'node:fs/promises'
import { getConfig, getConfigPath, setConfig, updateConfig } from './config.js'

export async function getApiToken(): Promise<string> {
    const envToken = process.env.TWIST_API_TOKEN
    if (envToken) {
        return envToken
    }

    const config = await getConfig()
    if (config.token) {
        return config.token
    }

    throw new Error(
        `No API token found. Set TWIST_API_TOKEN environment variable or add "token" to ${getConfigPath()}`,
    )
}

export async function saveApiToken(token: string): Promise<void> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new Error('Invalid token: Token must be at least 10 characters')
    }

    // Update config with new token using the existing config system
    await updateConfig({ token: token.trim() })
}

export async function clearApiToken(): Promise<void> {
    const config = await getConfig()

    // Remove the token from config
    delete config.token

    // If config is empty after removing the token, delete the config file
    if (Object.keys(config).length === 0) {
        try {
            await unlink(getConfigPath())
        } catch {
            // Config file doesn't exist, nothing to delete
        }
    } else {
        // Otherwise, save the config without the token
        await setConfig(config)
    }
}
