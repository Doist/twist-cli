import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
}))

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: mocks.getConfig,
        updateConfig: mocks.updateConfig,
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
        mocks.updateConfig.mockReset().mockResolvedValue(undefined)
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
        mocks.getConfig.mockResolvedValue({
            currentWorkspace: 7,
            ...mocks.updateConfig.mock.calls[0][0],
        })

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

        expect(mocks.updateConfig.mock.calls[0][0].token).toBeUndefined()
    })

    it('synthesises a record with empty id for legacy token-only users (no authUserId)', async () => {
        // `tw auth token <token>` users have `authMode` but no `authUserId`.
        // Returning `[]` here would leave their keyring entry orphaned once
        // PR β wires the adapter into `KeyringTokenStore`.
        mocks.getConfig.mockResolvedValue({
            token: 'tk_legacy_token_value',
            authMode: 'unknown',
            currentWorkspace: 7,
        })

        const [record] = await createTwistUserRecordStore().list()

        expect(record.account.id).toBe('')
        expect(record.account.authMode).toBe('unknown')
        expect(record.fallbackToken).toBe('tk_legacy_token_value')
    })

    it('remove clears all auth fields when the id matches', async () => {
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)

        await createTwistUserRecordStore().remove('42')

        expect(mocks.updateConfig).toHaveBeenCalledWith({
            authUserId: undefined,
            authUserName: undefined,
            authMode: undefined,
            authScope: undefined,
            token: undefined,
        })
    })

    it('remove is a no-op when the id does not match (skips disk write entirely)', async () => {
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)

        await createTwistUserRecordStore().remove('999')

        expect(mocks.updateConfig).not.toHaveBeenCalled()
    })

    it('setDefaultId is a no-op for the single-user adapter (no stale orphans, no phantom writes)', async () => {
        mocks.getConfig.mockResolvedValue(STORED_CONFIG)
        const store = createTwistUserRecordStore()

        await store.setDefaultId(null) // would orphan token + name
        await store.setDefaultId('999') // empty/mismatched ref would synthesise a phantom record
        await store.setDefaultId('42') // matching ref is already the only record

        expect(mocks.updateConfig).not.toHaveBeenCalled()
    })
})
