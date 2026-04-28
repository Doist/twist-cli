import type { Config, StoredAccount } from './config.js'
import { CliError } from './errors.js'

/**
 * Reference shape accepted by `--user` and `tw account` subcommands: an
 * exact Twist user id, or a Twist account email (case-insensitive).
 */
export type AccountRef = string

export interface FindAccountResult {
    account: StoredAccount
    index: number
}

export class AccountNotFoundError extends CliError {
    constructor(ref: AccountRef) {
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

export function getStoredAccounts(config: Config): StoredAccount[] {
    return Array.isArray(config.accounts) ? config.accounts : []
}

export function findAccountByRef(config: Config, ref: AccountRef): FindAccountResult | null {
    const accounts = getStoredAccounts(config)
    const trimmed = ref.trim()
    if (!trimmed) return null

    // Exact id match first (Twist user ids are numeric strings; case-sensitive)
    const byId = accounts.findIndex((a) => a.id === trimmed)
    if (byId !== -1) return { account: accounts[byId], index: byId }

    // Email match — case-insensitive
    const lower = trimmed.toLowerCase()
    const byEmail = accounts.findIndex((a) => a.email.toLowerCase() === lower)
    if (byEmail !== -1) return { account: accounts[byEmail], index: byEmail }

    return null
}

export function requireAccountByRef(config: Config, ref: AccountRef): FindAccountResult {
    const found = findAccountByRef(config, ref)
    if (!found) throw new AccountNotFoundError(ref)
    return found
}

export function getDefaultAccountId(config: Config): string | undefined {
    return config.account?.defaultAccount
}

export function getDefaultAccount(config: Config): StoredAccount | null {
    const id = getDefaultAccountId(config)
    if (!id) return null
    return getStoredAccounts(config).find((a) => a.id === id) ?? null
}

/**
 * Replace or append an account record. Returns a new config and whether the
 * account was already present (so callers can distinguish "added" from
 * "updated").
 */
export function upsertStoredAccount(
    config: Config,
    next: StoredAccount,
): { config: Config; replaced: boolean } {
    const accounts = getStoredAccounts(config).slice()
    const idx = accounts.findIndex((a) => a.id === next.id)
    const replaced = idx !== -1
    if (replaced) {
        accounts[idx] = next
    } else {
        accounts.push(next)
    }
    return { config: { ...config, accounts }, replaced }
}

export function removeStoredAccount(config: Config, id: string): Config {
    const accounts = getStoredAccounts(config).filter((a) => a.id !== id)
    const next: Config = { ...config, accounts }
    if (next.account?.defaultAccount === id) {
        const { defaultAccount: _, ...restAccount } = next.account
        next.account = Object.keys(restAccount).length === 0 ? undefined : restAccount
        if (next.account === undefined) {
            const { account: _a, ...rest } = next
            return rest
        }
    }
    return next
}

export function setDefaultAccount(config: Config, id: string): Config {
    return { ...config, account: { ...config.account, defaultAccount: id } }
}
