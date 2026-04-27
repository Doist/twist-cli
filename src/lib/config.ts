import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError } from './errors.js'

export const CONFIG_PATH = join(homedir(), '.config', 'twist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'token',
    'pendingSecureStoreClear',
    'currentWorkspace',
    'authMode',
    'authScope',
    'updateChannel',
    'userSettings',
])

const KNOWN_USER_SETTINGS_KEYS: ReadonlySet<string> = new Set(['unarchiveNewThreads'])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export interface UserSettings {
    unarchiveNewThreads?: boolean
}

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
    userSettings?: UserSettings
}

export async function getConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        return JSON.parse(content) as Config
    } catch {
        return {}
    }
}

export type StrictReadResult = { state: 'missing' } | { state: 'present'; config: Config }

/**
 * Read and parse the config file strictly — for inspection commands that need
 * to distinguish "missing" from "present but broken". `getConfig` deliberately
 * swallows errors for runtime code paths; this one surfaces them.
 */
export async function readConfigStrict(): Promise<StrictReadResult> {
    let content: string
    try {
        content = await readFile(CONFIG_PATH, 'utf-8')
    } catch (error) {
        if (isMissingFileError(error)) return { state: 'missing' }
        const detail = error instanceof Error ? error.message : String(error)
        throw new CliError(
            'CONFIG_READ_FAILED',
            `Could not read config file ${CONFIG_PATH}: ${detail}`,
            ['Check file permissions, or run `tw doctor` to diagnose'],
        )
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new CliError(
            'CONFIG_INVALID_JSON',
            `Config file at ${CONFIG_PATH} is not valid JSON: ${detail}`,
            ['Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`'],
        )
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const actual = Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed
        throw new CliError(
            'CONFIG_INVALID_SHAPE',
            `Config file at ${CONFIG_PATH} must contain a JSON object (got ${actual})`,
            ['Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`'],
        )
    }

    return { state: 'present', config: parsed as Config }
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
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

    if (config.userSettings !== undefined) {
        const userSettings = config.userSettings
        if (
            userSettings === null ||
            typeof userSettings !== 'object' ||
            Array.isArray(userSettings)
        ) {
            issues.push('userSettings must be an object')
        } else {
            const settingsRecord = userSettings as Record<string, unknown>
            for (const key of Object.keys(settingsRecord)) {
                if (!KNOWN_USER_SETTINGS_KEYS.has(key)) {
                    issues.push(`userSettings contains unrecognized key "${key}"`)
                }
            }
            if (
                settingsRecord.unarchiveNewThreads !== undefined &&
                typeof settingsRecord.unarchiveNewThreads !== 'boolean'
            ) {
                issues.push('userSettings.unarchiveNewThreads must be a boolean')
            }
        }
    }

    return issues
}

export function getConfigPath(): string {
    return CONFIG_PATH
}
