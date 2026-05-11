import {
    getConfigPath as getConfigPathCore,
    readConfig as readConfigCore,
    readConfigStrict as readConfigStrictCore,
    updateConfig as updateConfigCore,
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

export const CONFIG_VERSION = 2 as const

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'config_version',
    'user',
    'users',
    'updateChannel',
    // Snake_case alias persisted on disk so cli-core's update command can read
    // it directly. The in-memory `Config` type only exposes `updateChannel` —
    // see `fromDiskShape` / `toDiskShape` for the persistence-seam translation.
    'update_channel',
    'userSettings',
    // ---- Legacy v1 keys tolerated until migration runs ----
    'token',
    'pendingSecureStoreClear',
    'authMode',
    'authScope',
    'currentWorkspace',
])

const KNOWN_USER_SETTINGS_KEYS: ReadonlySet<string> = new Set(['unarchiveNewThreads'])
const KNOWN_USER_CONFIG_KEYS: ReadonlySet<string> = new Set(['default_user'])
const KNOWN_STORED_USER_KEYS: ReadonlySet<string> = new Set([
    'id',
    'email',
    'name',
    'auth_mode',
    'auth_scope',
    'api_token',
    'pending_secure_store_clear',
    'current_workspace',
])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
export const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export type UserSettings = {
    unarchiveNewThreads?: boolean
}

export type UserConfig = {
    /** Twist user id of the default user, used when `--user` is not given. */
    default_user?: string
}

/**
 * Per-user record stored in `config.users`. Each entry represents one
 * authenticated Twist user identity. The token itself lives in the OS
 * credential manager under account `user-<id>`; `api_token` only appears
 * here when the credential manager was unavailable at save time (plaintext
 * fallback). Snake_case field names match the todoist-cli schema so a
 * future cli-core extraction is a drop-in.
 */
export type StoredUser = {
    id: string
    email: string
    name?: string
    auth_mode?: AuthMode
    auth_scope?: string
    api_token?: string
    pending_secure_store_clear?: boolean
    /**
     * Twist workspace id this user is currently scoped to. Per-user so
     * that `tw --user <other> ...` doesn't try to use the previous user's
     * workspace (which the other user may not be a member of).
     */
    current_workspace?: number
}

export type Config = {
    /** Schema marker — present on v2+ configs. Absent on legacy v1 installs. */
    config_version?: number
    /** Selection state — which stored user is the default. */
    user?: UserConfig
    /** All authenticated Twist users. */
    users?: StoredUser[]

    updateChannel?: UpdateChannel
    userSettings?: UserSettings

    // ---- Legacy v1 fields, read for one-time migration ----
    token?: string
    pendingSecureStoreClear?: boolean
    authMode?: AuthMode
    authScope?: string
    /**
     * Legacy: pre-multi-account installs stored a single workspace id at the
     * top level. Migrated onto the default account on first read; never
     * written by current code.
     */
    currentWorkspace?: number
}

/**
 * Read-seam translation: normalise the persisted shape to the in-memory
 * `Config` shape. cli-core's update command writes the channel under
 * `update_channel`; older twist builds wrote it under `updateChannel`.
 * We accept both and expose only `updateChannel` to twist callers.
 *
 * `update_channel` wins if both are present (cli-core just wrote, so the
 * snake_case value is freshest). Non-object inputs (a manually-edited
 * config containing `null` or a primitive) are returned untouched so the
 * downstream `Record<string, unknown>` cast doesn't blow up on `in`.
 */
function fromDiskShape(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {}
    }
    const record = raw as Record<string, unknown>
    const hasCanonical = 'update_channel' in record
    const hasLegacy = 'updateChannel' in record
    if (!hasCanonical && !hasLegacy) return record
    const { update_channel, updateChannel, ...rest } = record
    const channel = hasCanonical ? update_channel : updateChannel
    return channel === undefined ? rest : { ...rest, updateChannel: channel }
}

/**
 * Write-seam translation: dual-write `updateChannel` and `update_channel`
 * to disk when a channel is set, so older twist builds keep reading the
 * camelCase key while cli-core's update command reads the snake_case key.
 * Once all deployed twist versions read `update_channel`, drop the
 * camelCase write (likely a release or two after this lands).
 */
function toDiskShape(config: Partial<Config>): Record<string, unknown> {
    const { updateChannel, ...rest } = config
    if (updateChannel === undefined) return rest
    return { ...rest, updateChannel, update_channel: updateChannel }
}

/**
 * Thin wrapper around cli-core's lenient `readConfig`. Returns `{}` when the
 * file is missing, unreadable, or invalid — runtime code paths treat "no
 * config" and "empty config" the same. Use `readConfigStrict` for inspection
 * commands that need to distinguish failure modes.
 */
export async function getConfig(): Promise<Config> {
    const raw = await readConfigCore<Record<string, unknown>>(getConfigPath())
    return fromDiskShape(raw) as Config
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
            return {
                state: 'present',
                config: fromDiskShape(result.config) as Config,
            }
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

/** Thin wrapper around cli-core's `writeConfig`. Dual-writes the channel field. */
export async function setConfig(config: Config): Promise<void> {
    await writeConfigCore(getConfigPath(), toDiskShape(config))
}

/**
 * Atomic partial-write wrapper around cli-core's `updateConfig`. Preserves
 * cli-core's read-merge-write atomicity so two concurrent `tw` processes
 * can't lose each other's updates. Channel field is translated to disk
 * shape (dual-written) before the merge.
 */
export async function updateConfig(updates: Partial<Config>): Promise<void> {
    await updateConfigCore<Record<string, unknown>>(getConfigPath(), toDiskShape(updates))
}

export function validateConfigForDoctor(config: Record<string, unknown>): string[] {
    const issues: string[] = []

    for (const key of Object.keys(config)) {
        if (!KNOWN_CONFIG_KEYS.has(key)) {
            issues.push(`contains unrecognized key "${key}"`)
        }
    }

    if (
        config.config_version !== undefined &&
        (typeof config.config_version !== 'number' || config.config_version < 1)
    ) {
        issues.push('config_version must be a positive number')
    }

    if (config.user !== undefined) {
        if (!isObject(config.user)) {
            issues.push('user must be an object')
        } else {
            for (const key of Object.keys(config.user)) {
                if (!KNOWN_USER_CONFIG_KEYS.has(key)) {
                    issues.push(`user contains unrecognized key "${key}"`)
                }
            }
            const defaultUser = (config.user as Record<string, unknown>).default_user
            if (defaultUser !== undefined && typeof defaultUser !== 'string') {
                issues.push('user.default_user must be a string')
            }
        }
    }

    if (config.users !== undefined) {
        if (!Array.isArray(config.users)) {
            issues.push('users must be an array')
        } else {
            for (const [i, entry] of config.users.entries()) {
                if (!isObject(entry)) {
                    issues.push(`users[${i}] must be an object`)
                    continue
                }
                for (const key of Object.keys(entry)) {
                    if (!KNOWN_STORED_USER_KEYS.has(key)) {
                        issues.push(`users[${i}] contains unrecognized key "${key}"`)
                    }
                }
                if (typeof entry.id !== 'string' || !entry.id) {
                    issues.push(`users[${i}].id must be a non-empty string`)
                }
                if (typeof entry.email !== 'string' || !entry.email) {
                    issues.push(`users[${i}].email must be a non-empty string`)
                }
                if (entry.name !== undefined && typeof entry.name !== 'string') {
                    issues.push(`users[${i}].name must be a string`)
                }
                if (
                    entry.auth_mode !== undefined &&
                    (typeof entry.auth_mode !== 'string' ||
                        !AUTH_MODES.has(entry.auth_mode as AuthMode))
                ) {
                    issues.push(
                        `users[${i}].auth_mode must be one of: read-only, read-write, unknown`,
                    )
                }
                if (entry.auth_scope !== undefined && typeof entry.auth_scope !== 'string') {
                    issues.push(`users[${i}].auth_scope must be a string`)
                }
                if (entry.api_token !== undefined && typeof entry.api_token !== 'string') {
                    issues.push(`users[${i}].api_token must be a string`)
                }
                if (
                    entry.pending_secure_store_clear !== undefined &&
                    typeof entry.pending_secure_store_clear !== 'boolean'
                ) {
                    issues.push(`users[${i}].pending_secure_store_clear must be a boolean`)
                }
                if (
                    entry.current_workspace !== undefined &&
                    (!Number.isInteger(entry.current_workspace) ||
                        Number(entry.current_workspace) <= 0)
                ) {
                    issues.push(`users[${i}].current_workspace must be a positive integer`)
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

    if (
        config.update_channel !== undefined &&
        (typeof config.update_channel !== 'string' ||
            !UPDATE_CHANNELS.has(config.update_channel as UpdateChannel))
    ) {
        issues.push('update_channel must be one of: stable, pre-release')
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
