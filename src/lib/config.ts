import {
    getConfigPath as getConfigPathCore,
    readConfig as readConfigCore,
    readConfigStrict as readConfigStrictCore,
    writeConfig as writeConfigCore,
} from '@doist/cli-core'
import { CliError } from './errors.js'

const APP_NAME = 'twist-cli'

/**
 * Resolve the canonical config path lazily. Computing on each call (instead of
 * caching at module load) keeps the path responsive to vitest's `vi.doMock`
 * for `node:os` — which only reliably reaches cli-core's compiled `homedir()`
 * call after the mock has been set up by the test, not at import time.
 */
export function getConfigPath(): string {
    return getConfigPathCore(APP_NAME)
}

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

/**
 * Thin wrapper around cli-core's lenient `readConfig`. Returns `{}` when the
 * file is missing, unreadable, or invalid — runtime code paths treat "no
 * config" and "empty config" the same. Use `readConfigStrict` for inspection
 * commands that need to distinguish failure modes.
 */
export async function getConfig(): Promise<Config> {
    return (await readConfigCore<Config>(getConfigPath())) as Config
}

export type StrictReadResult = { state: 'missing' } | { state: 'present'; config: Config }

/**
 * Read and parse the config file strictly — for inspection commands that need
 * to distinguish "missing" from "present but broken". `getConfig` deliberately
 * swallows errors for runtime code paths; this one surfaces them.
 */
export async function readConfigStrict(): Promise<StrictReadResult> {
    const path = getConfigPath()
    const result = await readConfigStrictCore(path)
    switch (result.state) {
        case 'missing':
            return { state: 'missing' }
        case 'present':
            return { state: 'present', config: result.config as Config }
        case 'read-failed':
            throw new CliError(
                'CONFIG_READ_FAILED',
                `Could not read config file ${path}: ${result.error.message}`,
                ['Check file permissions, or run `tw doctor` to diagnose'],
            )
        case 'invalid-json':
            throw new CliError(
                'CONFIG_INVALID_JSON',
                `Config file at ${path} is not valid JSON: ${result.error.message}`,
                [
                    'Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`',
                ],
            )
        case 'invalid-shape':
            throw new CliError(
                'CONFIG_INVALID_SHAPE',
                `Config file at ${path} must contain a JSON object (got ${result.actual})`,
                [
                    'Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`',
                ],
            )
    }
}

/** Thin wrapper around cli-core's `writeConfig`. */
export async function setConfig(config: Config): Promise<void> {
    await writeConfigCore(getConfigPath(), config)
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
