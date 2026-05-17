import type { UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import type { TwistAccount } from './auth-provider.js'
import { type Config, getConfig, updateConfig } from './config.js'

/**
 * Adapt twist's current flat config fields (`authUserId` / `authUserName` /
 * `authMode` / `authScope` / `token`) into cli-core's `UserRecordStore`
 * interface. Single-user today: `list()` returns at most one record, derived
 * from those fields; `upsert` and `remove` write or strip them. The shape
 * stays exactly as it is on disk — no v1→v2 migration here.
 *
 * `token` is surfaced as `fallbackToken` (cli-core's name for the plaintext
 * copy persisted when the OS keyring is unreachable at write time).
 *
 * Legacy `tw auth token` users have no `authUserId` but do have `authMode`
 * (and usually a `token`); `buildRecords` synthesises a record with
 * `account.id = ''` for them so PR β's `KeyringTokenStore` can still find
 * and read their keyring entry instead of treating them as logged-out.
 */
export function createTwistUserRecordStore(): UserRecordStore<TwistAccount> {
    return {
        async list() {
            return buildRecords(await getConfig())
        },
        async upsert(record) {
            await updateConfig(applyUpsert(record))
        },
        async remove(id) {
            const config = await getConfig()
            const next = applyRemove(config, id)
            if (next === config) return
            await updateConfig(next)
        },
        async getDefaultId() {
            const [record] = buildRecords(await getConfig())
            return record ? record.account.id : null
        },
        async setDefaultId(id) {
            const config = await getConfig()
            const next = applySetDefault(config, id)
            if (next === config) return
            await updateConfig(next)
        },
    }
}

function buildRecords(config: Config): UserRecord<TwistAccount>[] {
    // Truly empty: no identity AND no auth metadata AND no plaintext token.
    if (
        config.authUserId === undefined &&
        config.authMode === undefined &&
        config.token === undefined
    ) {
        return []
    }
    const account: TwistAccount = {
        id: config.authUserId !== undefined ? String(config.authUserId) : '',
        label: config.authUserName ?? '',
        authMode: config.authMode ?? 'unknown',
        authScope: config.authScope ?? '',
    }
    const record: UserRecord<TwistAccount> = { account }
    const trimmed = config.token?.trim()
    if (trimmed) record.fallbackToken = trimmed
    return [record]
}

function applyUpsert(record: UserRecord<TwistAccount>): Partial<Config> {
    const userId = Number(record.account.id)
    const trimmed = record.fallbackToken?.trim()
    return {
        // Empty / non-numeric account.id (the legacy token-only case) writes
        // `undefined` so the key drops from disk on serialisation; numeric
        // ids round-trip as `number`.
        authUserId: Number.isFinite(userId) && userId > 0 ? userId : undefined,
        authUserName: record.account.label,
        authMode: record.account.authMode,
        authScope: record.account.authScope,
        // REPLACE semantics: absent / blank `fallbackToken` clears the slot.
        token: trimmed && trimmed.length > 0 ? trimmed : undefined,
    }
}

function applyRemove(config: Config, id: string): Config | Partial<Config> {
    const records = buildRecords(config)
    if (records.length === 0 || records[0].account.id !== id) return config
    return {
        authUserId: undefined,
        authUserName: undefined,
        authMode: undefined,
        authScope: undefined,
        token: undefined,
    }
}

function applySetDefault(config: Config, id: string | null): Config | Partial<Config> {
    // Single-user adapter can't represent "stored but not default"; the only
    // meaningful default is the one identity already on disk, so both
    // `setDefaultId(null)` and `setDefaultId(<x>)` on an empty config are
    // no-ops (the matching-id path is also a no-op because the record is
    // already the default by virtue of being the only one).
    if (id === null) return config
    const records = buildRecords(config)
    if (records.length === 0) return config
    if (records[0].account.id !== id) return config
    return config
}
