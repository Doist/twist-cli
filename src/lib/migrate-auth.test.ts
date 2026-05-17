import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    migrateLegacyAuth: vi.fn(),
    twistApiCtor: vi.fn(),
    getSessionUserMock: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
}))

vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return { ...actual, migrateLegacyAuth: mocks.migrateLegacyAuth }
})

vi.mock('@doist/twist-sdk', () => ({
    TwistApi: mocks.twistApiCtor.mockImplementation(function (this: object, _token: string) {
        Object.assign(this, { users: { getSessionUser: mocks.getSessionUserMock } })
    }),
}))

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: mocks.getConfig,
        updateConfig: mocks.updateConfig,
    }
})

import type { MigrateLegacyAuthOptions } from '@doist/cli-core/auth'
import { runMigrateLegacyAuth } from './migrate-auth.js'

type Opts = MigrateLegacyAuthOptions<{
    id: string
    label: string
    authMode: 'read-only' | 'read-write' | 'unknown'
    authScope: string
}>

describe('runMigrateLegacyAuth', () => {
    beforeEach(() => {
        mocks.migrateLegacyAuth.mockReset().mockResolvedValue({ status: 'no-legacy-state' })
        mocks.twistApiCtor.mockClear()
        mocks.getSessionUserMock.mockReset()
        mocks.getConfig.mockReset()
        mocks.updateConfig.mockReset().mockResolvedValue(undefined)
    })

    it('passes twist-cli wiring to cli-core: serviceName, the api-token legacy slot, silent flag, and no accountForUser override (cli-core default user-${id} is used)', async () => {
        await runMigrateLegacyAuth({ silent: true })

        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts
        expect(options.serviceName).toBe('twist-cli')
        expect(options.legacyAccount).toBe('api-token')
        expect(options.accountForUser).toBeUndefined()
        expect(options.silent).toBe(true)
    })

    it('hasMigrated returns true once config_version reaches 2 (one-way gate)', async () => {
        // v1 → v2 migration only — the check uses a local schema version so a
        // future v3 bump doesn't cause this helper to spuriously re-run.
        mocks.getConfig.mockResolvedValueOnce({ config_version: 2 })
        mocks.getConfig.mockResolvedValueOnce({ config_version: 3 })
        mocks.getConfig.mockResolvedValueOnce({ config_version: 1 })
        mocks.getConfig.mockResolvedValueOnce({})

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        expect(await options.hasMigrated()).toBe(true)
        expect(await options.hasMigrated()).toBe(true)
        expect(await options.hasMigrated()).toBe(false)
        expect(await options.hasMigrated()).toBe(false)
    })

    it('markMigrated writes config_version = 2 exactly (decoupled from any future CONFIG_VERSION bump)', async () => {
        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        await options.markMigrated()

        expect(mocks.updateConfig).toHaveBeenCalledWith({ config_version: 2 })
    })

    it('loadLegacyPlaintextToken returns trimmed config.token, or null when blank/absent', async () => {
        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        mocks.getConfig.mockResolvedValueOnce({ token: '  tk_legacy  ' })
        expect(await options.loadLegacyPlaintextToken()).toBe('tk_legacy')

        mocks.getConfig.mockResolvedValueOnce({ token: '   ' })
        expect(await options.loadLegacyPlaintextToken()).toBeNull()

        mocks.getConfig.mockResolvedValueOnce({})
        expect(await options.loadLegacyPlaintextToken()).toBeNull()
    })

    it('identifyAccount resolves a TwistAccount from a raw TwistApi + v1 auth metadata on disk (no spinner-wrapped client — keeps migration outside the runtime auth graph)', async () => {
        mocks.getSessionUserMock.mockResolvedValue({ id: 42, name: 'Ada' })
        mocks.getConfig.mockResolvedValue({ authMode: 'read-write', authScope: 'user:read' })

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        expect(await options.identifyAccount('tk_legacy')).toEqual({
            id: '42',
            label: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        expect(mocks.twistApiCtor).toHaveBeenCalledWith('tk_legacy')
    })

    it('identifyAccount runs the API call and the local getConfig() concurrently', async () => {
        // The two reads are independent; firing them sequentially adds an
        // avoidable round-trip on every postinstall migration. Resolve the
        // API call first and assert getConfig was already in flight by then.
        let resolveApi: (value: { id: number; name: string }) => void = () => {}
        const apiPromise = new Promise<{ id: number; name: string }>((res) => {
            resolveApi = res
        })
        mocks.getSessionUserMock.mockReturnValueOnce(apiPromise)
        mocks.getConfig.mockResolvedValueOnce({ authMode: 'read-only', authScope: 'user:read' })

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        const identifyPromise = options.identifyAccount('tk_legacy')
        // getConfig should have been kicked off before we resolved the API.
        expect(mocks.getConfig).toHaveBeenCalledTimes(1)
        resolveApi({ id: 42, name: 'Ada' })

        await expect(identifyPromise).resolves.toEqual({
            id: '42',
            label: 'Ada',
            authMode: 'read-only',
            authScope: 'user:read',
        })
    })

    it('identifyAccount falls back to unknown/empty metadata for `tw auth token` users with no authMode on disk', async () => {
        mocks.getSessionUserMock.mockResolvedValue({ id: 7, name: 'Carl' })
        mocks.getConfig.mockResolvedValue({})

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        expect(await options.identifyAccount('tk_legacy')).toEqual({
            id: '7',
            label: 'Carl',
            authMode: 'unknown',
            authScope: '',
        })
    })

    it('cleanupLegacyConfig clears every v1 flat field in a single updateConfig call', async () => {
        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        await options.cleanupLegacyConfig!()

        expect(mocks.updateConfig).toHaveBeenCalledWith({
            token: undefined,
            authMode: undefined,
            authScope: undefined,
            authUserId: undefined,
            authUserName: undefined,
            pendingSecureStoreClear: undefined,
        })
    })

    it('returns the underlying MigrateAuthResult unchanged (no-legacy-state / already-migrated / skipped surface as-is)', async () => {
        mocks.migrateLegacyAuth.mockResolvedValueOnce({ status: 'already-migrated' })
        expect((await runMigrateLegacyAuth({ silent: true })).status).toBe('already-migrated')

        mocks.migrateLegacyAuth.mockResolvedValueOnce({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        const result = await runMigrateLegacyAuth({ silent: true })
        expect(result).toEqual({ status: 'skipped', reason: 'identify-failed', detail: 'offline' })
    })
})
