import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    setConfig: vi.fn(),
}))

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: mocks.getConfig,
        setConfig: mocks.setConfig,
    }
})

import type { Config } from './config.js'
import { createTwistUserRecordStore } from './user-records.js'

const STORED_CONFIG: Config = {
    token: 'tk_stored_1234567890',
    authMode: 'read-write',
    authScope: 'user:read',
    authUserId: 42,
    authUserName: 'Ada',
    currentWorkspace: 7,
}

describe('createTwistUserRecordStore', () => {
    beforeEach(() => {
        mocks.getConfig.mockReset()
        mocks.setConfig.mockReset().mockResolvedValue(undefined)
    })

    it('round-trips a record through upsert + list', async () => {
        mocks.getConfig.mockResolvedValue({ currentWorkspace: 7 })
        const store = createTwistUserRecordStore()
        const record = {
            account: {
                id: '42',
                label: 'Ada',
                authMode: 'read-write' as const,
                authScope: 'user:read',
            },
            fallbackToken: 'tk_stored_1234567890',
        }

        await store.upsert(record)
        // Simulate the just-written state so the subsequent list reads it back.
        mocks.getConfig.mockResolvedValue(mocks.setConfig.mock.calls[0][0])

        expect(await store.list()).toEqual([record])
    })

    it('strips the token on upsert when fallbackToken is absent (cli-core replace-not-merge)', async () => {
        // Without this, a stale plaintext token would survive a successful
        // keyring-backed write and the runtime would prefer it over the
        // fresh keyring value.
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)

        await createTwistUserRecordStore().upsert({
            account: {
                id: '42',
                label: 'Ada',
                authMode: 'read-write',
                authScope: 'user:read',
            },
        })

        expect(mocks.setConfig.mock.calls[0][0]).not.toHaveProperty('token')
    })

    it('remove is a no-op when the id does not match (cli-core contract)', async () => {
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)

        await createTwistUserRecordStore().remove('999')

        expect(mocks.setConfig).toHaveBeenCalledWith(STORED_CONFIG)
    })

    it('setDefaultId(null) clears authUserId without disturbing other fields', async () => {
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)

        await createTwistUserRecordStore().setDefaultId(null)

        const written = mocks.setConfig.mock.calls[0][0] as Config
        expect(written).not.toHaveProperty('authUserId')
        expect(written.token).toBe('tk_stored_1234567890')
        expect(written.currentWorkspace).toBe(7)
    })
})
