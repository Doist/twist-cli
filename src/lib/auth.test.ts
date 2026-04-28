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
        getConfigPath: vi.fn(() => '/home/user/.config/twist-cli/config.json'),
        setConfig: vi.fn(),
        unlink: vi.fn(),
        // tracks the account name passed to createSecureStore
        secureStoreFactory: vi.fn(),
        secureStoreError: null as Error | null,
    }
})

vi.mock('./config.js', async () => {
    const actual = await vi.importActual<typeof import('./config.js')>('./config.js')
    return {
        ...actual,
        getConfig: mocks.getConfig,
        getConfigPath: mocks.getConfigPath,
        setConfig: mocks.setConfig,
    }
})

vi.mock('./secure-store.js', () => ({
    SECURE_STORE_DESCRIPTION: 'system credential manager',
    SecureStoreUnavailableError: mocks.MockSecureStoreUnavailableError,
    LEGACY_ACCOUNT_NAME: 'api-token',
    accountForUser: (id: string) => `user-${id}`,
    createSecureStore: (account = 'api-token') => {
        mocks.secureStoreFactory(account)
        return {
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
        }
    },
}))

vi.mock('node:fs/promises', () => ({
    unlink: mocks.unlink,
}))

describe('auth multi-account storage', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.getConfig.mockReset()
        mocks.setConfig.mockReset()
        mocks.unlink.mockReset()
        mocks.keyringEntries.clear()
        mocks.secureStoreError = null
        delete process.env.TWIST_API_TOKEN
    })

    afterEach(() => {
        delete process.env.TWIST_API_TOKEN
    })

    // --- env var --------------------------------------------------------------

    it('TWIST_API_TOKEN bypasses stored accounts', async () => {
        process.env.TWIST_API_TOKEN = 'env_token_123456'

        const { getApiToken, resolveActiveAccount } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('env_token_123456')
        await expect(resolveActiveAccount()).resolves.toMatchObject({
            id: 'env',
            source: 'env',
        })
        expect(mocks.getConfig).not.toHaveBeenCalled()
    })

    // --- upsertAccount --------------------------------------------------------

    it('upsertAccount stores token in per-account keyring slot and writes v2 config', async () => {
        mocks.getConfig.mockResolvedValue({})

        const { upsertAccount } = await import('./auth.js')

        await expect(
            upsertAccount({
                id: '12345',
                email: 'me@example.com',
                name: 'Scott',
                token: 'oauth-token-1234567',
                authMode: 'read-write',
                authScope: 'user:read user:write',
            }),
        ).resolves.toEqual({ storage: 'secure-store', replaced: false })

        expect(mocks.entry('user-12345').token).toBe('oauth-token-1234567')
        expect(mocks.setConfig).toHaveBeenCalledWith({
            configVersion: 2,
            account: { defaultAccount: '12345' },
            accounts: [
                {
                    id: '12345',
                    email: 'me@example.com',
                    name: 'Scott',
                    authMode: 'read-write',
                    authScope: 'user:read user:write',
                },
            ],
        })
    })

    it('upsertAccount sets the new account as default even when an orphaned defaultAccount points elsewhere', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: 'orphan' },
            accounts: [],
        })

        const { upsertAccount } = await import('./auth.js')

        await upsertAccount({
            id: '111',
            email: 'a@b.c',
            token: 'first-token-1234567',
        })

        expect(mocks.setConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                account: { defaultAccount: '111' },
                accounts: [expect.objectContaining({ id: '111' })],
            }),
        )
    })

    it('upsertAccount does NOT overwrite an existing default when adding a second account', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '111' },
            accounts: [{ id: '111', email: 'first@example.com' }],
        })

        const { upsertAccount } = await import('./auth.js')

        await upsertAccount({
            id: '222',
            email: 'second@example.com',
            token: 'second-token-1234567',
        })

        const written = mocks.setConfig.mock.calls.at(-1)?.[0]
        expect(written.account).toEqual({ defaultAccount: '111' })
        expect(written.accounts.map((a: { id: string }) => a.id)).toEqual(['111', '222'])
    })

    it('upsertAccount falls back to per-account plaintext when keyring unavailable', async () => {
        mocks.getConfig.mockResolvedValue({})
        mocks.secureStoreError = new mocks.MockSecureStoreUnavailableError('no keychain')

        const { upsertAccount } = await import('./auth.js')

        const result = await upsertAccount({
            id: '12345',
            email: 'me@example.com',
            token: 'fallback-token-1234567',
        })

        expect(result.storage).toBe('config-file')
        expect(result.warning).toContain('plaintext')
        const written = mocks.setConfig.mock.calls.at(-1)?.[0]
        expect(written.accounts[0].token).toBe('fallback-token-1234567')
    })

    it('upsertAccount rolls back the keyring write when the config write fails', async () => {
        mocks.getConfig.mockResolvedValue({})
        mocks.setConfig.mockRejectedValue(new Error('EACCES'))

        const { upsertAccount } = await import('./auth.js')

        await expect(
            upsertAccount({ id: '12345', email: 'me@example.com', token: 'rollback-1234567' }),
        ).rejects.toMatchObject({ code: 'CONFIG_WRITE_FAILED' })
        expect(mocks.entry('user-12345').token).toBeNull()
    })

    // --- resolveActiveAccount -------------------------------------------------

    it('resolves single stored account implicitly', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [{ id: '111', email: 'a@b.c' }],
        })
        mocks.entry('user-111').token = 'stored-token'

        const { resolveActiveAccount } = await import('./auth.js')

        await expect(resolveActiveAccount()).resolves.toMatchObject({
            id: '111',
            email: 'a@b.c',
            token: 'stored-token',
            source: 'secure-store',
        })
    })

    it('resolves the configured default when multiple accounts are stored', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '222' },
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        mocks.entry('user-222').token = 'token-222'

        const { resolveActiveAccount } = await import('./auth.js')

        await expect(resolveActiveAccount()).resolves.toMatchObject({
            id: '222',
            token: 'token-222',
        })
    })

    it('errors when multiple accounts are stored without a default and no --user', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })

        const { resolveActiveAccount } = await import('./auth.js')
        const { NoAccountSelectedError } = await import('./accounts.js')

        await expect(resolveActiveAccount()).rejects.toBeInstanceOf(NoAccountSelectedError)
    })

    it('honors an explicit ref override (case-insensitive email)', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '111' },
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'D@E.F' },
            ],
        })
        mocks.entry('user-222').token = 'token-222'

        const { resolveActiveAccount } = await import('./auth.js')

        await expect(resolveActiveAccount({ ref: 'd@e.f' })).resolves.toMatchObject({
            id: '222',
        })
        await expect(resolveActiveAccount({ ref: '222' })).resolves.toMatchObject({ id: '222' })
    })

    it('throws AccountNotFoundError when ref does not match', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [{ id: '111', email: 'a@b.c' }],
        })

        const { resolveActiveAccount } = await import('./auth.js')
        const { AccountNotFoundError } = await import('./accounts.js')

        await expect(resolveActiveAccount({ ref: 'nope' })).rejects.toBeInstanceOf(
            AccountNotFoundError,
        )
    })

    // --- legacy fallback ------------------------------------------------------

    it('serves a legacy config token when no v2 accounts exist', async () => {
        mocks.getConfig.mockResolvedValue({
            token: 'legacy-token-1234567',
            authMode: 'read-write',
        })

        const { resolveActiveAccount } = await import('./auth.js')

        const resolved = await resolveActiveAccount()
        expect(resolved.id).toBe('legacy')
        expect(resolved.token).toBe('legacy-token-1234567')
        expect(resolved.authMode).toBe('read-write')
        // does NOT auto-migrate at runtime — postinstall's job
        expect(mocks.setConfig).not.toHaveBeenCalled()
    })

    it('serves a legacy keyring token when no v2 accounts and no plaintext', async () => {
        mocks.getConfig.mockResolvedValue({})
        mocks.entry('api-token').token = 'legacy-secure-1234567'

        const { resolveActiveAccount } = await import('./auth.js')

        const resolved = await resolveActiveAccount()
        expect(resolved.id).toBe('legacy')
        expect(resolved.token).toBe('legacy-secure-1234567')
        expect(resolved.source).toBe('secure-store')
    })

    it('does not reauth from legacy keyring when v2 accounts[] is explicitly empty', async () => {
        // Logged-out v2 install — leftover api-token must NOT be picked up.
        mocks.getConfig.mockResolvedValue({ configVersion: 2, accounts: [] })
        mocks.entry('api-token').token = 'leftover-from-v1'

        const { resolveActiveAccount, NoTokenError } = await import('./auth.js')

        await expect(resolveActiveAccount()).rejects.toBeInstanceOf(NoTokenError)
    })

    it('treats v1 pendingSecureStoreClear as logged out', async () => {
        mocks.getConfig.mockResolvedValue({ pendingSecureStoreClear: true })
        mocks.entry('api-token').token = 'stale-1234567'

        const { resolveActiveAccount, NoTokenError } = await import('./auth.js')

        await expect(resolveActiveAccount()).rejects.toBeInstanceOf(NoTokenError)
    })

    it('probeApiToken surfaces SecureStoreUnavailableError instead of NoTokenError', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [{ id: '111', email: 'a@b.c' }],
        })
        mocks.secureStoreError = new mocks.MockSecureStoreUnavailableError('keychain locked')

        const { probeApiToken } = await import('./auth.js')

        await expect(probeApiToken()).rejects.toBeInstanceOf(mocks.MockSecureStoreUnavailableError)
    })

    it('getAuthMetadata degrades to unknown when the keyring is offline', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [{ id: '111', email: 'a@b.c' }],
        })
        mocks.secureStoreError = new mocks.MockSecureStoreUnavailableError('keychain locked')

        const { getAuthMetadata } = await import('./auth.js')

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'unknown',
            source: 'secure-store',
        })
    })

    // --- removeAccountById / clearApiToken -----------------------------------

    it('removeAccountById writes config first then deletes secret', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '111' },
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        mocks.entry('user-111').token = 't1'
        mocks.entry('user-222').token = 't2'

        const { removeAccountById } = await import('./auth.js')

        await expect(removeAccountById('111')).resolves.toEqual({ storage: 'secure-store' })

        expect(mocks.entry('user-111').token).toBeNull()
        const written = mocks.setConfig.mock.calls.at(-1)?.[0]
        expect(written.accounts.map((a: { id: string }) => a.id)).toEqual(['222'])
        expect(written.account).toBeUndefined()
    })

    it('removeAccountById fails hard when config write fails — keyring untouched', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '111' },
            accounts: [{ id: '111', email: 'a@b.c' }],
        })
        mocks.entry('user-111').token = 'preserved'
        mocks.setConfig.mockRejectedValue(new Error('EACCES'))

        const { removeAccountById } = await import('./auth.js')

        await expect(removeAccountById('111')).rejects.toMatchObject({
            code: 'CONFIG_WRITE_FAILED',
        })
        expect(mocks.entry('user-111').token).toBe('preserved')
    })

    it('clearApiToken errors when multiple accounts stored and no --user', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })

        const { clearApiToken } = await import('./auth.js')
        const { NoAccountSelectedError } = await import('./accounts.js')

        await expect(clearApiToken()).rejects.toBeInstanceOf(NoAccountSelectedError)
    })

    it('clearApiToken targets the default account when one is set', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            account: { defaultAccount: '222' },
            accounts: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        mocks.entry('user-222').token = 't2'

        const { clearApiToken } = await import('./auth.js')
        await clearApiToken()

        expect(mocks.entry('user-222').token).toBeNull()
        const written = mocks.setConfig.mock.calls.at(-1)?.[0]
        expect(written.accounts).toEqual([{ id: '111', email: 'a@b.c' }])
    })

    // --- setDefaultAccountId --------------------------------------------------

    it('setDefaultAccountId only accepts a stored account', async () => {
        mocks.getConfig.mockResolvedValue({
            configVersion: 2,
            accounts: [{ id: '111', email: 'a@b.c' }],
        })

        const { setDefaultAccountId } = await import('./auth.js')
        const { AccountNotFoundError } = await import('./accounts.js')

        await expect(setDefaultAccountId('999')).rejects.toBeInstanceOf(AccountNotFoundError)
        await setDefaultAccountId('111')
        const written = mocks.setConfig.mock.calls.at(-1)?.[0]
        expect(written.account).toEqual({ defaultAccount: '111' })
    })
})
