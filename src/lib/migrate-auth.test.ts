import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    class MockSecureStoreUnavailableError extends Error {}

    interface KeyringEntry {
        token: string | null
    }
    const keyringEntries = new Map<string, KeyringEntry>()
    function entry(account: string): KeyringEntry {
        let e = keyringEntries.get(account)
        if (!e) {
            e = { token: null }
            keyringEntries.set(account, e)
        }
        return e
    }

    return {
        MockSecureStoreUnavailableError,
        keyringEntries,
        entry,
        getConfig: vi.fn(),
        setConfig: vi.fn(),
        secureStoreError: null as Error | null,
    }
})

vi.mock('./config.js', async () => {
    const actual = await vi.importActual<typeof import('./config.js')>('./config.js')
    return {
        ...actual,
        getConfig: mocks.getConfig,
        setConfig: mocks.setConfig,
    }
})

vi.mock('./secure-store.js', () => ({
    SECURE_STORE_DESCRIPTION: 'system credential manager',
    SecureStoreUnavailableError: mocks.MockSecureStoreUnavailableError,
    LEGACY_ACCOUNT_NAME: 'api-token',
    accountForUser: (id: string) => `user-${id}`,
    createSecureStore: (account = 'api-token') => ({
        async getSecret(): Promise<string | null> {
            if (mocks.secureStoreError) throw mocks.secureStoreError
            return mocks.entry(account).token
        },
        async setSecret(secret: string): Promise<void> {
            if (mocks.secureStoreError) throw mocks.secureStoreError
            mocks.entry(account).token = secret
        },
        async deleteSecret(): Promise<boolean> {
            if (mocks.secureStoreError) throw mocks.secureStoreError
            const e = mocks.entry(account)
            const had = e.token !== null
            e.token = null
            return had
        },
    }),
}))

describe('migrateLegacyAuth', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.getConfig.mockReset()
        mocks.setConfig.mockReset()
        mocks.keyringEntries.clear()
        mocks.secureStoreError = null
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('reports already-migrated when accounts array exists', async () => {
        mocks.getConfig.mockResolvedValue({ configVersion: 2, accounts: [] })

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl: failingFetch })

        expect(result.status).toBe('already-migrated')
        expect(mocks.setConfig).not.toHaveBeenCalled()
    })

    it('reports no-legacy-state when config has no auth-related fields', async () => {
        mocks.getConfig.mockResolvedValue({})

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl: failingFetch })

        expect(result.status).toBe('no-legacy-state')
        expect(mocks.setConfig).not.toHaveBeenCalled()
    })

    it('migrates a v1 plaintext token via REST session-user fetch', async () => {
        mocks.getConfig.mockResolvedValue({
            token: 'legacy-1234567',
            authMode: 'read-write',
            authScope: 'user:read user:write',
            currentWorkspace: 42,
        })

        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify({ id: 999, email: 'me@example.com', name: 'Scott' }), {
                    status: 200,
                }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result).toMatchObject({
            status: 'migrated',
            migratedUserId: '999',
            migratedEmail: 'me@example.com',
        })
        expect(mocks.entry('user-999').token).toBe('legacy-1234567')
        expect(mocks.setConfig).toHaveBeenCalledWith({
            configVersion: 2,
            currentWorkspace: 42,
            account: { defaultAccount: '999' },
            accounts: [
                {
                    id: '999',
                    email: 'me@example.com',
                    name: 'Scott',
                    authMode: 'read-write',
                    authScope: 'user:read user:write',
                },
            ],
        })
    })

    it('migrates a legacy keyring token (api-token account)', async () => {
        mocks.getConfig.mockResolvedValue({})
        mocks.entry('api-token').token = 'legacy-secure-1234567'

        const fetchImpl = vi.fn(
            async () => new Response(JSON.stringify({ id: 42, email: 'k@e.y' }), { status: 200 }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result.status).toBe('migrated')
        expect(mocks.entry('user-42').token).toBe('legacy-secure-1234567')
        // legacy slot cleared
        expect(mocks.entry('api-token').token).toBeNull()
    })

    it('skips and leaves config untouched when fetch fails', async () => {
        mocks.getConfig.mockResolvedValue({ token: 'legacy-1234567' })

        const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result.status).toBe('skipped')
        expect(mocks.setConfig).not.toHaveBeenCalled()
    })
})

const failingFetch: typeof fetch = async () => {
    throw new Error('fetch should not be called')
}
