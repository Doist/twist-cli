import type { Config, StoredUser } from './config.js'
import { CliError } from './errors.js'

/**
 * Reference shape accepted by `--user` and `tw account` subcommands: an
 * exact Twist user id, or a Twist account email (case-insensitive).
 */
export type UserRef = string

export type FindUserResult = {
    user: StoredUser
    index: number
}

/**
 * Error surfaced when a `--user <ref>` or `tw account use <ref>` doesn't
 * match any stored user. Named `AccountNotFoundError` (and code
 * `ACCOUNT_NOT_FOUND`) for symmetry with the user-facing `tw account`
 * command surface — twist already exposes `tw user` for displaying
 * Twist API user info, so the multi-identity command lives under
 * `account`. The on-disk storage shape stays user-centric (`users[]`,
 * `StoredUser`) so a future cli-core extraction is a drop-in.
 */
export class AccountNotFoundError extends CliError {
    constructor(ref: UserRef) {
        super(
            'ACCOUNT_NOT_FOUND',
            `No stored account matches "${ref}". Use \`tw account list\` to see authenticated accounts.`,
            [
                'Run `tw auth login` to add an account, or `tw account list` to inspect existing ones',
            ],
            'info',
        )
        this.name = 'AccountNotFoundError'
    }
}

export class NoAccountSelectedError extends CliError {
    constructor() {
        super(
            'NO_ACCOUNT_SELECTED',
            'Multiple Twist accounts are stored. Specify which one to use.',
            [
                'Pass `--user <id|email>` on the command, or',
                'Set a default with `tw account use <id|email>`',
            ],
            'info',
        )
        this.name = 'NoAccountSelectedError'
    }
}

export function getStoredUsers(config: Config): StoredUser[] {
    return Array.isArray(config.users) ? config.users : []
}

export function findUserByRef(config: Config, ref: UserRef): FindUserResult | null {
    const users = getStoredUsers(config)
    const trimmed = ref.trim()
    if (!trimmed) return null

    // Exact id match first (Twist user ids are numeric strings; case-sensitive)
    const byId = users.findIndex((u) => u.id === trimmed)
    if (byId !== -1) return { user: users[byId], index: byId }

    // Email match — case-insensitive
    const lower = trimmed.toLowerCase()
    const byEmail = users.findIndex((u) => u.email.toLowerCase() === lower)
    if (byEmail !== -1) return { user: users[byEmail], index: byEmail }

    return null
}

export function requireUserByRef(config: Config, ref: UserRef): FindUserResult {
    const found = findUserByRef(config, ref)
    if (!found) throw new AccountNotFoundError(ref)
    return found
}

export function getDefaultUserId(config: Config): string | undefined {
    return config.user?.default_user
}

export function getDefaultUser(config: Config): StoredUser | null {
    const id = getDefaultUserId(config)
    if (!id) return null
    return getStoredUsers(config).find((u) => u.id === id) ?? null
}

/**
 * Replace or append a stored-user record. Returns a new config and whether
 * the user was already present (so callers can distinguish "added" from
 * "updated").
 */
export function upsertStoredUser(
    config: Config,
    next: StoredUser,
): { config: Config; replaced: boolean } {
    const users = getStoredUsers(config).slice()
    const idx = users.findIndex((u) => u.id === next.id)
    const replaced = idx !== -1
    if (replaced) {
        users[idx] = next
    } else {
        users.push(next)
    }
    return { config: { ...config, users }, replaced }
}

export function removeStoredUser(config: Config, id: string): Config {
    const users = getStoredUsers(config).filter((u) => u.id !== id)
    const next: Config = { ...config, users }
    if (next.user?.default_user === id) {
        const { default_user: _, ...restUser } = next.user
        next.user = Object.keys(restUser).length === 0 ? undefined : restUser
        if (next.user === undefined) {
            const { user: _u, ...rest } = next
            return rest
        }
    }
    return next
}

export function setDefaultUser(config: Config, id: string): Config {
    return { ...config, user: { ...config.user, default_user: id } }
}

/**
 * Patch a single stored user in-place. No-op if no user matches `id`.
 */
export function updateStoredUser(config: Config, id: string, patch: Partial<StoredUser>): Config {
    const users = getStoredUsers(config).map((u) => (u.id === id ? { ...u, ...patch } : u))
    return { ...config, users }
}
