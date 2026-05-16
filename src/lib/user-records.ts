import type { UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import type { TwistAccount } from './auth-provider.js'
import { type Config, getConfig, setConfig } from './config.js'

/**
 * Adapt twist's current flat config fields (`authUserId` / `authUserName` /
 * `authMode` / `authScope` / `token`) into cli-core's `UserRecordStore`
 * interface. Single-user today: `list()` returns at most one record, derived
 * from those fields; `upsert` and `remove` write or strip them. The shape
 * stays exactly as it is on disk — no v1→v2 migration here.
 *
 * `token` is surfaced as `fallbackToken` (cli-core's name for the plaintext
 * copy persisted when the OS keyring is unreachable at write time).
 */
export function createTwistUserRecordStore(): UserRecordStore<TwistAccount> {
    return {
        async list() {
            return buildRecords(await getConfig())
        },
        async upsert(record) {
            await setConfig(applyUpsert(await getConfig(), record))
        },
        async remove(id) {
            await setConfig(applyRemove(await getConfig(), id))
        },
        async getDefaultId() {
            const config = await getConfig()
            return buildRecords(config).length > 0 && config.authUserId !== undefined
                ? String(config.authUserId)
                : null
        },
        async setDefaultId(id) {
            await setConfig(applySetDefault(await getConfig(), id))
        },
    }
}

function buildRecords(config: Config): UserRecord<TwistAccount>[] {
    if (config.authUserId === undefined) return []
    const account: TwistAccount = {
        id: String(config.authUserId),
        label: config.authUserName ?? '',
        authMode: config.authMode ?? 'unknown',
        authScope: config.authScope ?? '',
    }
    const record: UserRecord<TwistAccount> = { account }
    const trimmed = config.token?.trim()
    if (trimmed) record.fallbackToken = trimmed
    return [record]
}

function applyUpsert(config: Config, record: UserRecord<TwistAccount>): Config {
    const userId = Number(record.account.id)
    const next: Config = {
        ...config,
        authUserId: Number.isFinite(userId) ? userId : config.authUserId,
        authUserName: record.account.label,
        authMode: record.account.authMode,
        authScope: record.account.authScope,
    }
    // REPLACE semantics (per cli-core's contract): an absent `fallbackToken`
    // means "no plaintext token", so the stored value must be cleared.
    if (record.fallbackToken !== undefined) {
        next.token = record.fallbackToken
    } else {
        delete next.token
    }
    return next
}

function applyRemove(config: Config, id: string): Config {
    if (config.authUserId === undefined || String(config.authUserId) !== id) {
        return config
    }
    const {
        token: _t,
        authMode: _m,
        authScope: _s,
        authUserId: _id,
        authUserName: _n,
        ...rest
    } = config
    return rest
}

function applySetDefault(config: Config, id: string | null): Config {
    if (id === null) {
        const { authUserId: _id, ...rest } = config
        return rest
    }
    const numeric = Number(id)
    if (!Number.isFinite(numeric)) return config
    // Single-user adapter: cli-core's `KeyringTokenStore.setDefault` validates
    // the id against `list()` first, so a non-matching ref reaches us only
    // through programmer error — no-op rather than overwrite the stored
    // identity.
    if (config.authUserId !== undefined && config.authUserId !== numeric) {
        return config
    }
    return { ...config, authUserId: numeric }
}
