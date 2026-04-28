import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError } from './errors.js'

export const CONFIG_PATH = join(homedir(), '.config', 'twist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

export const CONFIG_VERSION = 2 as const

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'configVersion',
    'account',
    'accounts',
    'currentWorkspace',
    'updateChannel',
    'userSettings',
    // Legacy v1 keys — tolerated until migration runs (postinstall + lazy fallback).
    'token',
    'pendingSecureStoreClear',
    'authMode',
    'authScope',
])

const KNOWN_USER_SETTINGS_KEYS: ReadonlySet<string> = new Set(['unarchiveNewThreads'])
const KNOWN_ACCOUNT_CONFIG_KEYS: ReadonlySet<string> = new Set(['defaultAccount'])
const KNOWN_STORED_ACCOUNT_KEYS: ReadonlySet<string> = new Set([
    'id',
    'email',
    'name',
    'authMode',
    'authScope',
    'token',
    'pendingSecureStoreClear',
])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export interface UserSettings {
    unarchiveNewThreads?: boolean
}

export interface AccountConfig {
    /** Twist user id of the default account, used when --user is not given. */
    defaultAccount?: string
}

/**
 * Per-account record stored in `config.accounts`. Each entry represents one
 * authenticated Twist user identity. The token itself lives in the OS
 * credential manager under account `user-<id>`; `token` only appears here
 * when the credential manager was unavailable at save time (plaintext fallback).
 */
export interface StoredAccount {
    id: string
    email: string
    name?: string
    authMode?: AuthMode
    authScope?: string
    token?: string
    pendingSecureStoreClear?: boolean
}

export interface Config {
    /** Schema marker — present on v2+ configs. Absent on legacy v1 installs. */
    configVersion?: number
    /** Selection state — which stored account is the default. */
    account?: AccountConfig
    /** All authenticated Twist accounts. */
    accounts?: StoredAccount[]

    currentWorkspace?: number
    updateChannel?: UpdateChannel
    userSettings?: UserSettings

    // ---- Legacy v1 fields, read for one-time migration ----
    token?: string
    pendingSecureStoreClear?: boolean
    authMode?: AuthMode
    authScope?: string
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

    if (
        config.configVersion !== undefined &&
        (typeof config.configVersion !== 'number' || config.configVersion < 1)
    ) {
        issues.push('configVersion must be a positive number')
    }

    if (config.account !== undefined) {
        if (!isObject(config.account)) {
            issues.push('account must be an object')
        } else {
            for (const key of Object.keys(config.account)) {
                if (!KNOWN_ACCOUNT_CONFIG_KEYS.has(key)) {
                    issues.push(`account contains unrecognized key "${key}"`)
                }
            }
            const defaultAccount = (config.account as Record<string, unknown>).defaultAccount
            if (defaultAccount !== undefined && typeof defaultAccount !== 'string') {
                issues.push('account.defaultAccount must be a string')
            }
        }
    }

    if (config.accounts !== undefined) {
        if (!Array.isArray(config.accounts)) {
            issues.push('accounts must be an array')
        } else {
            for (const [i, entry] of config.accounts.entries()) {
                if (!isObject(entry)) {
                    issues.push(`accounts[${i}] must be an object`)
                    continue
                }
                for (const key of Object.keys(entry)) {
                    if (!KNOWN_STORED_ACCOUNT_KEYS.has(key)) {
                        issues.push(`accounts[${i}] contains unrecognized key "${key}"`)
                    }
                }
                if (typeof entry.id !== 'string' || !entry.id) {
                    issues.push(`accounts[${i}].id must be a non-empty string`)
                }
                if (typeof entry.email !== 'string' || !entry.email) {
                    issues.push(`accounts[${i}].email must be a non-empty string`)
                }
                if (entry.name !== undefined && typeof entry.name !== 'string') {
                    issues.push(`accounts[${i}].name must be a string`)
                }
                if (
                    entry.authMode !== undefined &&
                    (typeof entry.authMode !== 'string' ||
                        !AUTH_MODES.has(entry.authMode as AuthMode))
                ) {
                    issues.push(
                        `accounts[${i}].authMode must be one of: read-only, read-write, unknown`,
                    )
                }
                if (entry.authScope !== undefined && typeof entry.authScope !== 'string') {
                    issues.push(`accounts[${i}].authScope must be a string`)
                }
                if (entry.token !== undefined && typeof entry.token !== 'string') {
                    issues.push(`accounts[${i}].token must be a string`)
                }
                if (
                    entry.pendingSecureStoreClear !== undefined &&
                    typeof entry.pendingSecureStoreClear !== 'boolean'
                ) {
                    issues.push(`accounts[${i}].pendingSecureStoreClear must be a boolean`)
                }
            }
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
        if (!isObject(userSettings)) {
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

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function getConfigPath(): string {
    return CONFIG_PATH
}
