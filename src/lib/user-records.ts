import type { UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import type { TwistAccount } from './auth-provider.js'
import { type Config, type StoredUser, getConfig, updateConfig } from './config.js'
import { makeTwistAccount } from './twist-account.js'

/**
 * `UserRecordStore` adapter over `config.users[]`. `StoredUser.token` is
 * surfaced as `fallbackToken` — cli-core's name for the plaintext copy
 * persisted only when the keyring is unreachable.
 */
export function createTwistUserRecordStore(): UserRecordStore<TwistAccount> {
    return {
        async list() {
            const config = await getConfig()
            return (config.users ?? []).map(toRecord)
        },
        async upsert(record) {
            const config = await getConfig()
            const existing = config.users ?? []
            const next = fromRecord(record)
            const index = existing.findIndex((u) => u.id === record.account.id)
            const users =
                index >= 0
                    ? [...existing.slice(0, index), next, ...existing.slice(index + 1)]
                    : [...existing, next]
            await updateConfig({ users })
        },
        async remove(id) {
            const config = await getConfig()
            const existing = config.users ?? []
            const index = existing.findIndex((u) => u.id === id)
            if (index < 0) return
            const users = [...existing.slice(0, index), ...existing.slice(index + 1)]
            const updates: { users: StoredUser[]; defaultUserId?: undefined } = { users }
            if (config.defaultUserId === id) updates.defaultUserId = undefined
            await updateConfig(updates)
        },
        async getDefaultId() {
            const config = await getConfig()
            return config.defaultUserId ?? null
        },
        async setDefaultId(id) {
            await updateConfig({ defaultUserId: id ?? undefined })
        },
    }
}

/**
 * Resolve the default-or-first `UserRecord` from an already-loaded config.
 * Returns `null` when no users are stored.
 */
export function getDefaultUserRecord(config: Config): UserRecord<TwistAccount> | null {
    const users = config.users ?? []
    if (users.length === 0) return null
    const defaultId = config.defaultUserId
    const user = (defaultId && users.find((u) => u.id === defaultId)) || users[0]
    return toRecord(user)
}

function toRecord(user: StoredUser): UserRecord<TwistAccount> {
    const account = makeTwistAccount({
        id: user.id,
        label: user.name,
        authMode: user.authMode,
        authScope: user.authScope,
    })
    const trimmed = user.token?.trim()
    const record: UserRecord<TwistAccount> = { account }
    if (trimmed) record.fallbackToken = trimmed
    return record
}

function fromRecord(record: UserRecord<TwistAccount>): StoredUser {
    // Replace, don't merge: an absent `fallbackToken` strips the plaintext
    // slot so it can't shadow a fresh keyring-backed write. cli-core contract.
    const trimmed = record.fallbackToken?.trim()
    const next: StoredUser = {
        id: record.account.id,
        name: record.account.label,
        authMode: record.account.authMode,
        authScope: record.account.authScope,
    }
    if (trimmed && trimmed.length > 0) next.token = trimmed
    return next
}
