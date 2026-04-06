import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.config', 'twist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'token',
    'pendingSecureStoreClear',
    'currentWorkspace',
    'authMode',
    'authScope',
    'updateChannel',
])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export interface Config {
    // Legacy plaintext token storage retained for migration and secure-store fallback only.
    token?: string
    // Non-secret state used to finish logout after transient secure-store failures.
    pendingSecureStoreClear?: boolean
    currentWorkspace?: number
    // Auth metadata persisted alongside the token to track OAuth scope.
    authMode?: AuthMode
    authScope?: string
    updateChannel?: UpdateChannel
}

export async function getConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        return JSON.parse(content) as Config
    } catch {
        return {}
    }
}

export async function setConfig(config: Config): Promise<void> {
    const dir = dirname(CONFIG_PATH)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
    })
    await chmod(CONFIG_PATH, 0o600)
}

export async function updateConfig(updates: Partial<Config>): Promise<void> {
    const config = await getConfig()
    await setConfig({ ...config, ...updates })
}

export function validateConfigForDoctor(config: Record<string, unknown>): string[] {
    const issues: string[] = []

    for (const key of Object.keys(config)) {
        if (!KNOWN_CONFIG_KEYS.has(key)) {
            issues.push(`contains unrecognized key "${key}"`)
        }
    }

    if (config.token !== undefined && typeof config.token !== 'string') {
        issues.push('token must be a string')
    }

    if (
        config.pendingSecureStoreClear !== undefined &&
        typeof config.pendingSecureStoreClear !== 'boolean'
    ) {
        issues.push('pendingSecureStoreClear must be a boolean')
    }

    if (
        config.currentWorkspace !== undefined &&
        (!Number.isInteger(config.currentWorkspace) || Number(config.currentWorkspace) <= 0)
    ) {
        issues.push('currentWorkspace must be a positive integer')
    }

    if (
        config.authMode !== undefined &&
        (typeof config.authMode !== 'string' || !AUTH_MODES.has(config.authMode as AuthMode))
    ) {
        issues.push('authMode must be one of: read-only, read-write, unknown')
    }

    if (config.authScope !== undefined && typeof config.authScope !== 'string') {
        issues.push('authScope must be a string')
    }

    if (
        config.updateChannel !== undefined &&
        (typeof config.updateChannel !== 'string' ||
            !UPDATE_CHANNELS.has(config.updateChannel as UpdateChannel))
    ) {
        issues.push('updateChannel must be one of: stable, pre-release')
    }

    return issues
}

export function getConfigPath(): string {
    return CONFIG_PATH
}
