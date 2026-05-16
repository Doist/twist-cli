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

    describe('list()', () => {
        it('returns an empty array when no authUserId is persisted', async () => {
            mocks.getConfig.mockResolvedValue({ currentWorkspace: 7 })

            expect(await createTwistUserRecordStore().list()).toEqual([])
        })

        it('returns the single record reconstructed from flat config fields', async () => {
            mocks.getConfig.mockResolvedValue(STORED_CONFIG)

            expect(await createTwistUserRecordStore().list()).toEqual([
                {
                    account: {
                        id: '42',
                        label: 'Ada',
                        authMode: 'read-write',
                        authScope: 'user:read',
                    },
                    fallbackToken: 'tk_stored_1234567890',
                },
            ])
        })

        it('omits fallbackToken when no plaintext token is on disk', async () => {
            mocks.getConfig.mockResolvedValue({ ...STORED_CONFIG, token: undefined })

            const [record] = await createTwistUserRecordStore().list()

            expect(record).toEqual({
                account: {
                    id: '42',
                    label: 'Ada',
                    authMode: 'read-write',
                    authScope: 'user:read',
                },
            })
            expect(record).not.toHaveProperty('fallbackToken')
        })
    })

    describe('upsert(record)', () => {
        it('writes account fields and replaces token when fallbackToken is set', async () => {
            mocks.getConfig.mockResolvedValue({ currentWorkspace: 7 })

            await createTwistUserRecordStore().upsert({
                account: {
                    id: '42',
                    label: 'Ada',
                    authMode: 'read-write',
                    authScope: 'user:read',
                },
                fallbackToken: 'tk_new_9876543210',
            })

            expect(mocks.setConfig).toHaveBeenCalledWith({
                currentWorkspace: 7,
                token: 'tk_new_9876543210',
                authMode: 'read-write',
                authScope: 'user:read',
                authUserId: 42,
                authUserName: 'Ada',
            })
        })

        it('strips a stale token when fallbackToken is absent (replace-not-merge)', async () => {
            mocks.getConfig.mockResolvedValue(STORED_CONFIG)

            await createTwistUserRecordStore().upsert({
                account: {
                    id: '42',
                    label: 'Ada',
                    authMode: 'read-write',
                    authScope: 'user:read',
                },
            })

            const written = mocks.setConfig.mock.calls[0][0] as Config
            expect(written).not.toHaveProperty('token')
            expect(written.authUserId).toBe(42)
        })
    })

    describe('remove(id)', () => {
        it('clears all auth fields when the id matches the stored account', async () => {
            mocks.getConfig.mockResolvedValue(STORED_CONFIG)

            await createTwistUserRecordStore().remove('42')

            expect(mocks.setConfig).toHaveBeenCalledWith({ currentWorkspace: 7 })
        })

        it('is a no-op when the id does not match the stored account', async () => {
            mocks.getConfig.mockResolvedValue(STORED_CONFIG)

            await createTwistUserRecordStore().remove('999')

            expect(mocks.setConfig).toHaveBeenCalledWith(STORED_CONFIG)
        })
    })

    describe('default user pointer', () => {
        it('getDefaultId returns the stored authUserId as a string', async () => {
            mocks.getConfig.mockResolvedValue(STORED_CONFIG)

            expect(await createTwistUserRecordStore().getDefaultId()).toBe('42')
        })

        it('getDefaultId returns null when no record exists', async () => {
            mocks.getConfig.mockResolvedValue({ currentWorkspace: 7 })

            expect(await createTwistUserRecordStore().getDefaultId()).toBeNull()
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
})
