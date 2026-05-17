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

import type { Config, StoredUser } from './config.js'
import { createTwistUserRecordStore } from './user-records.js'

const ADA: StoredUser = {
    id: '42',
    name: 'Ada',
    authMode: 'read-write',
    authScope: 'user:read',
}

const BOB: StoredUser = {
    id: '99',
    name: 'Bob',
    authMode: 'read-only',
    authScope: 'user:read',
}

const ADA_RECORD = {
    account: { id: '42', label: 'Ada', authMode: 'read-write' as const, authScope: 'user:read' },
}

const BOB_RECORD = {
    account: { id: '99', label: 'Bob', authMode: 'read-only' as const, authScope: 'user:read' },
}

describe('createTwistUserRecordStore', () => {
    beforeEach(() => {
        mocks.getConfig.mockReset()
        mocks.updateConfig.mockReset().mockResolvedValue(undefined)
    })

    it('list returns empty when no users[] is persisted', async () => {
        mocks.getConfig.mockResolvedValue({ currentWorkspace: 7 } satisfies Config)

        expect(await createTwistUserRecordStore().list()).toEqual([])
    })

    it('list returns one record per StoredUser, surfacing token as fallbackToken', async () => {
        mocks.getConfig.mockResolvedValue({
            users: [{ ...ADA, token: 'tk_ada' }, BOB],
        } satisfies Config)

        expect(await createTwistUserRecordStore().list()).toEqual([
            { ...ADA_RECORD, fallbackToken: 'tk_ada' },
            BOB_RECORD,
        ])
    })

    it('upsert appends a new record when the id is not yet stored', async () => {
        mocks.getConfig.mockResolvedValue({ users: [ADA] } satisfies Config)

        await createTwistUserRecordStore().upsert(BOB_RECORD)

        expect(mocks.updateConfig).toHaveBeenCalledWith({ users: [ADA, BOB] })
    })

    it('upsert replaces (not merges) when the id matches: stale token cleared when fallbackToken absent', async () => {
        mocks.getConfig.mockResolvedValue({
            users: [{ ...ADA, token: 'tk_stale' }],
        } satisfies Config)

        await createTwistUserRecordStore().upsert(ADA_RECORD)

        expect(mocks.updateConfig).toHaveBeenCalledWith({ users: [ADA] })
    })

    it('upsert preserves order of other users when replacing in the middle', async () => {
        const carl: StoredUser = { id: '7', name: 'Carl', authMode: 'unknown', authScope: '' }
        mocks.getConfig.mockResolvedValue({ users: [ADA, carl, BOB] } satisfies Config)

        await createTwistUserRecordStore().upsert({
            account: { id: '7', label: 'Carl', authMode: 'unknown', authScope: '' },
            fallbackToken: 'tk_carl_new',
        })

        expect(mocks.updateConfig).toHaveBeenCalledWith({
            users: [ADA, { ...carl, token: 'tk_carl_new' }, BOB],
        })
    })

    it('remove drops the matching entry and leaves others in place', async () => {
        mocks.getConfig.mockResolvedValue({ users: [ADA, BOB] } satisfies Config)

        await createTwistUserRecordStore().remove('42')

        expect(mocks.updateConfig).toHaveBeenCalledWith({ users: [BOB] })
    })

    it('remove clears defaultUserId when the removed record was the default', async () => {
        mocks.getConfig.mockResolvedValue({
            users: [ADA, BOB],
            defaultUserId: '42',
        } satisfies Config)

        await createTwistUserRecordStore().remove('42')

        expect(mocks.updateConfig).toHaveBeenCalledWith({
            users: [BOB],
            defaultUserId: undefined,
        })
    })

    it('remove leaves defaultUserId untouched when the removed record was not the default', async () => {
        mocks.getConfig.mockResolvedValue({
            users: [ADA, BOB],
            defaultUserId: '99',
        } satisfies Config)

        await createTwistUserRecordStore().remove('42')

        expect(mocks.updateConfig).toHaveBeenCalledWith({ users: [BOB] })
    })

    it('remove is a no-op when the id does not match any stored user', async () => {
        mocks.getConfig.mockResolvedValue({ users: [ADA] } satisfies Config)

        await createTwistUserRecordStore().remove('999')

        expect(mocks.updateConfig).not.toHaveBeenCalled()
    })

    it('getDefaultId reads config.defaultUserId, returning null when absent', async () => {
        mocks.getConfig.mockResolvedValueOnce({ users: [ADA] } satisfies Config)
        expect(await createTwistUserRecordStore().getDefaultId()).toBeNull()

        mocks.getConfig.mockResolvedValueOnce({
            users: [ADA],
            defaultUserId: '42',
        } satisfies Config)
        expect(await createTwistUserRecordStore().getDefaultId()).toBe('42')
    })

    it('setDefaultId writes defaultUserId (and clears it when passed null)', async () => {
        const store = createTwistUserRecordStore()

        await store.setDefaultId('42')
        expect(mocks.updateConfig).toHaveBeenCalledWith({ defaultUserId: '42' })

        await store.setDefaultId(null)
        expect(mocks.updateConfig).toHaveBeenCalledWith({ defaultUserId: undefined })
    })

    it('round-trips a record through upsert + list (single-user case)', async () => {
        mocks.getConfig.mockResolvedValueOnce({ currentWorkspace: 7 } satisfies Config)
        const store = createTwistUserRecordStore()
        const record = { ...ADA_RECORD, fallbackToken: 'tk_stored_1234567890' }

        await store.upsert(record)
        const writtenUsers = mocks.updateConfig.mock.calls[0][0].users as StoredUser[]
        mocks.getConfig.mockResolvedValueOnce({ currentWorkspace: 7, users: writtenUsers })

        expect(await store.list()).toEqual([record])
    })
})
