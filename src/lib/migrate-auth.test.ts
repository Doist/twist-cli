import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    migrateLegacyAuth: vi.fn(),
    createWrappedTwistClient: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
}))

vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return { ...actual, migrateLegacyAuth: mocks.migrateLegacyAuth }
})

vi.mock('./api.js', () => ({ createWrappedTwistClient: mocks.createWrappedTwistClient }))

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: mocks.getConfig,
        updateConfig: mocks.updateConfig,
    }
})

import type { MigrateLegacyAuthOptions } from '@doist/cli-core/auth'
import { CONFIG_VERSION } from './config.js'
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
        mocks.createWrappedTwistClient.mockReset()
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

    it('hasMigrated returns true once config_version reaches the current CONFIG_VERSION (one-way gate)', async () => {
        mocks.getConfig.mockResolvedValueOnce({ config_version: CONFIG_VERSION })
        mocks.getConfig.mockResolvedValueOnce({ config_version: 1 })
        mocks.getConfig.mockResolvedValueOnce({})

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        expect(await options.hasMigrated()).toBe(true)
        expect(await options.hasMigrated()).toBe(false)
        expect(await options.hasMigrated()).toBe(false)
    })

    it('markMigrated writes config_version = CONFIG_VERSION', async () => {
        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        await options.markMigrated()

        expect(mocks.updateConfig).toHaveBeenCalledWith({ config_version: CONFIG_VERSION })
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

    it('identifyAccount resolves a TwistAccount from the API + v1 auth metadata on disk', async () => {
        const getSessionUser = vi.fn().mockResolvedValue({ id: 42, name: 'Ada' })
        mocks.createWrappedTwistClient.mockReturnValue({
            users: { getSessionUser },
        } as unknown as ReturnType<typeof mocks.createWrappedTwistClient>)
        mocks.getConfig.mockResolvedValue({ authMode: 'read-write', authScope: 'user:read' })

        await runMigrateLegacyAuth({ silent: true })
        const options = mocks.migrateLegacyAuth.mock.calls[0][0] as Opts

        expect(await options.identifyAccount('tk_legacy')).toEqual({
            id: '42',
            label: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        expect(mocks.createWrappedTwistClient).toHaveBeenCalledWith('tk_legacy')
    })

    it('identifyAccount falls back to unknown/empty metadata for `tw auth token` users with no authMode on disk', async () => {
        mocks.createWrappedTwistClient.mockReturnValue({
            users: { getSessionUser: vi.fn().mockResolvedValue({ id: 7, name: 'Carl' }) },
        } as unknown as ReturnType<typeof mocks.createWrappedTwistClient>)
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
