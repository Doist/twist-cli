import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configState: { current: import('./config.js').Config } = { current: {} }

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: vi.fn(async () => configState.current),
        setConfig: vi.fn(async (next: import('./config.js').Config) => {
            configState.current = next
        }),
    }
})

vi.mock('./secure-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./secure-store.js')>()
    return {
        ...actual,
        createSecureStore: vi.fn(),
    }
})

import {
    clearApiToken,
    listStoredUsers,
    NoTokenError,
    removeUserById,
    resolveActiveUser,
    setDefaultUserId,
    upsertUser,
} from './auth.js'
import type { Config } from './config.js'
import { createSecureStore } from './secure-store.js'
import { AccountNotFoundError, NoAccountSelectedError } from './users.js'

const mockCreateSecureStore = vi.mocked(createSecureStore)

function setConfigState(next: Config) {
    configState.current = next
}

function memorySecureStore() {
    let secret: string | null = null
    return {
        getSecret: vi.fn(async () => secret),
        setSecret: vi.fn(async (v: string) => {
            secret = v
        }),
        deleteSecret: vi.fn(async () => {
            const had = secret !== null
            secret = null
            return had
        }),
    }
}

describe('resolveActiveUser', () => {
    const originalEnv = process.env.TWIST_API_TOKEN

    beforeEach(() => {
        delete process.env.TWIST_API_TOKEN
        setConfigState({})
        mockCreateSecureStore.mockImplementation(() => memorySecureStore())
    })

    afterEach(() => {
        if (originalEnv !== undefined) process.env.TWIST_API_TOKEN = originalEnv
    })

    it('TWIST_API_TOKEN short-circuits to source: env', async () => {
        process.env.TWIST_API_TOKEN = 'env-token'
        const resolved = await resolveActiveUser()
        expect(resolved).toEqual({ token: 'env-token', authMode: 'unknown', source: 'env' })
    })

    it('throws NoTokenError on a clean v2 install with no users', async () => {
        setConfigState({ config_version: 2, users: [] })
        await expect(resolveActiveUser()).rejects.toBeInstanceOf(NoTokenError)
    })

    it('uses single stored user when no ref / default is set', async () => {
        const store = memorySecureStore()
        await store.setSecret('tk-1')
        mockCreateSecureStore.mockReturnValue(store)
        setConfigState({
            config_version: 2,
            users: [{ id: '1', email: 'a@a' }],
        })
        const resolved = await resolveActiveUser()
        expect(resolved.id).toBe('1')
        expect(resolved.token).toBe('tk-1')
        expect(resolved.source).toBe('secure-store')
    })

    it('NoAccountSelectedError when multiple users + no default + no ref', async () => {
        setConfigState({
            config_version: 2,
            users: [
                { id: '1', email: 'a@a' },
                { id: '2', email: 'b@b' },
            ],
        })
        await expect(resolveActiveUser()).rejects.toBeInstanceOf(NoAccountSelectedError)
    })

    it('uses --user <ref> over the default', async () => {
        const stores = new Map<string, ReturnType<typeof memorySecureStore>>()
        mockCreateSecureStore.mockImplementation((slot?: string) => {
            const key = slot ?? 'api-token'
            let s = stores.get(key)
            if (!s) {
                s = memorySecureStore()
                stores.set(key, s)
            }
            return s
        })
        const s1 = stores.get('user-1') ?? memorySecureStore()
        stores.set('user-1', s1)
        await s1.setSecret('tk-1')
        const s2 = stores.get('user-2') ?? memorySecureStore()
        stores.set('user-2', s2)
        await s2.setSecret('tk-2')

        setConfigState({
            config_version: 2,
            user: { default_user: '1' },
            users: [
                { id: '1', email: 'a@a' },
                { id: '2', email: 'b@b' },
            ],
        })

        expect((await resolveActiveUser()).id).toBe('1')
        expect((await resolveActiveUser({ ref: 'b@b' })).id).toBe('2')
        expect((await resolveActiveUser({ ref: '2' })).id).toBe('2')
    })

    it('AccountNotFoundError when --user matches nothing', async () => {
        setConfigState({
            config_version: 2,
            users: [{ id: '1', email: 'a@a' }],
        })
        await expect(resolveActiveUser({ ref: 'unknown' })).rejects.toBeInstanceOf(
            AccountNotFoundError,
        )
    })

    it('legacy v1 fallback returns token with legacy: true when no users key present', async () => {
        setConfigState({ token: 'legacy-plain-token', authMode: 'read-write' })
        const resolved = await resolveActiveUser()
        expect(resolved.token).toBe('legacy-plain-token')
        expect(resolved.legacy).toBe(true)
        expect(resolved.authMode).toBe('read-write')
        expect(resolved.id).toBeUndefined()
    })

    it('legacy fallback is gated on absence of users key (empty array != legacy)', async () => {
        setConfigState({ users: [], token: 'legacy-token' })
        await expect(resolveActiveUser()).rejects.toBeInstanceOf(NoTokenError)
    })
})

describe('upsertUser + clearApiToken + removeUserById + setDefaultUserId + listStoredUsers', () => {
    beforeEach(() => {
        delete process.env.TWIST_API_TOKEN
        setConfigState({})
        mockCreateSecureStore.mockImplementation(() => memorySecureStore())
    })

    it('upsertUser persists a v2 user record and auto-defaults the first one', async () => {
        const result = await upsertUser({
            id: '1',
            email: 'a@a',
            token: 'tk-aaaaaaaaaa',
            authMode: 'read-write',
        })
        expect(result.replaced).toBe(false)
        expect(result.storage).toBe('secure-store')
        expect(configState.current.users).toHaveLength(1)
        expect(configState.current.user?.default_user).toBe('1')
        expect(configState.current.config_version).toBe(2)
    })

    it('upsertUser does not flip default on the second user', async () => {
        await upsertUser({ id: '1', email: 'a@a', token: 'tk-aaaaaaaaaa' })
        await upsertUser({ id: '2', email: 'b@b', token: 'tk-bbbbbbbbbb' })
        expect(configState.current.user?.default_user).toBe('1')
        expect(configState.current.users).toHaveLength(2)
    })

    it('setDefaultUserId switches default and returns the resolved user', async () => {
        await upsertUser({ id: '1', email: 'a@a', token: 'tk-aaaaaaaaaa' })
        await upsertUser({ id: '2', email: 'b@b', token: 'tk-bbbbbbbbbb' })
        const user = await setDefaultUserId('b@b')
        expect(user.id).toBe('2')
        expect(configState.current.user?.default_user).toBe('2')
    })

    it('removeUserById drops the record and clears default if it pointed there', async () => {
        await upsertUser({ id: '1', email: 'a@a', token: 'tk-aaaaaaaaaa' })
        await removeUserById('1')
        expect(configState.current.users).toEqual([])
        expect(configState.current.user).toBeUndefined()
    })

    it('clearApiToken({ ref }) removes the matching user', async () => {
        await upsertUser({ id: '1', email: 'a@a', token: 'tk-aaaaaaaaaa' })
        await upsertUser({ id: '2', email: 'b@b', token: 'tk-bbbbbbbbbb' })
        await clearApiToken({ ref: 'a@a' })
        expect(configState.current.users?.map((u) => u.id)).toEqual(['2'])
    })

    it('listStoredUsers reports current array', async () => {
        await upsertUser({ id: '1', email: 'a@a', token: 'tk-aaaaaaaaaa' })
        expect(await listStoredUsers()).toEqual([
            expect.objectContaining({ id: '1', email: 'a@a' }),
        ])
    })
})
