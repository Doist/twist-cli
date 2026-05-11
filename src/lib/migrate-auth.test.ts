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

import type { Config } from './config.js'
import { migrateLegacyAuth } from './migrate-auth.js'
import { createSecureStore } from './secure-store.js'

const mockCreateSecureStore = vi.mocked(createSecureStore)

function memorySecureStore(initial: string | null = null) {
    let secret = initial
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

function fetchOk(body: object) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

function setConfigState(next: Config) {
    configState.current = next
}

describe('migrateLegacyAuth', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        setConfigState({})
        mockCreateSecureStore.mockImplementation(() => memorySecureStore())
        consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('returns already-migrated when users key is present (even if empty)', async () => {
        setConfigState({ users: [] })
        expect(await migrateLegacyAuth({ silent: true })).toEqual({ status: 'already-migrated' })
    })

    it('returns no-legacy-state when config is completely empty', async () => {
        setConfigState({})
        expect(await migrateLegacyAuth({ silent: true })).toEqual({ status: 'no-legacy-state' })
    })

    it('migrates legacy plaintext token into a per-user record', async () => {
        const legacyStore = memorySecureStore()
        const userStore = memorySecureStore()
        mockCreateSecureStore.mockImplementation((slot?: string) =>
            slot === 'user-42' ? userStore : legacyStore,
        )
        setConfigState({
            token: 'legacy-token',
            authMode: 'read-write',
            authScope: 'user:read threads:read',
        })

        const fetchImpl = fetchOk({ id: 42, email: 'ada@example.com', name: 'Ada' })
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result).toMatchObject({
            status: 'migrated',
            migratedUserId: '42',
            migratedEmail: 'ada@example.com',
        })
        expect(configState.current.users).toEqual([
            {
                id: '42',
                email: 'ada@example.com',
                name: 'Ada',
                auth_mode: 'read-write',
                auth_scope: 'user:read threads:read',
            },
        ])
        expect(configState.current.user?.default_user).toBe('42')
        expect(configState.current.token).toBeUndefined()
        expect(configState.current.authMode).toBeUndefined()
        expect(configState.current.config_version).toBe(2)
        expect(userStore.setSecret).toHaveBeenCalledWith('legacy-token')
    })

    it('migrates legacy keyring token (no plaintext) via the api-token slot', async () => {
        const legacyStore = memorySecureStore('keyring-token')
        const userStore = memorySecureStore()
        mockCreateSecureStore.mockImplementation((slot?: string) =>
            slot === 'user-7' ? userStore : legacyStore,
        )
        setConfigState({})
        // Make config look v1 by NOT having `users` key, but with no plaintext
        // token. The keyring read happens via createSecureStore(LEGACY_*).
        const fetchImpl = fetchOk({ id: 7, email: 'k@example.com' })
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })
        expect(result.status).toBe('migrated')
        expect(configState.current.users?.[0].id).toBe('7')
    })

    it('skips and leaves v1 state untouched when getSessionUser fails', async () => {
        setConfigState({ token: 'bad-token' })
        const failingFetch = vi.fn(async () => new Response('nope', { status: 401 }))
        const result = await migrateLegacyAuth({ silent: true, fetchImpl: failingFetch })
        expect(result.status).toBe('skipped')
        expect(configState.current.token).toBe('bad-token')
        expect(configState.current.users).toBeUndefined()
    })
})
