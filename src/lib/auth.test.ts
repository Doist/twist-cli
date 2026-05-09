import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    class MockSecureStoreUnavailableError extends Error {}

    return {
        MockSecureStoreUnavailableError,
        readConfig: vi.fn(),
        getConfigPath: vi.fn(() => '/home/user/.config/twist-cli/config.json'),
        secureTokenStore: {
            getSecret: vi.fn(),
            setSecret: vi.fn(),
            deleteSecret: vi.fn(),
        },
        writeConfig: vi.fn(),
        unlink: vi.fn(),
        updateConfig: vi.fn(),
    }
})

vi.mock('./config.js', () => ({
    readConfig: mocks.readConfig,
    getConfigPath: mocks.getConfigPath,
    writeConfig: mocks.writeConfig,
    updateConfig: mocks.updateConfig,
}))

vi.mock('./secure-store.js', () => ({
    createSecureStore: () => mocks.secureTokenStore,
    SECURE_STORE_DESCRIPTION: 'system credential manager',
    SecureStoreUnavailableError: mocks.MockSecureStoreUnavailableError,
}))

vi.mock('node:fs/promises', () => ({
    unlink: mocks.unlink,
}))

describe('auth token storage', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.readConfig.mockReset()
        mocks.writeConfig.mockReset()
        mocks.updateConfig.mockReset()
        mocks.unlink.mockReset()
        mocks.secureTokenStore.getSecret.mockReset()
        mocks.secureTokenStore.setSecret.mockReset()
        mocks.secureTokenStore.deleteSecret.mockReset()
        delete process.env.TWIST_API_TOKEN
    })

    afterEach(() => {
        delete process.env.TWIST_API_TOKEN
    })

    it('prefers TWIST_API_TOKEN over stored credentials', async () => {
        process.env.TWIST_API_TOKEN = 'env_token_123456'

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('env_token_123456')
        expect(mocks.secureTokenStore.getSecret).not.toHaveBeenCalled()
        expect(mocks.readConfig).not.toHaveBeenCalled()
    })

    it('migrates a legacy plaintext config token into the secure store', async () => {
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 42,
        })

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('legacy_token_123456')
        expect(mocks.secureTokenStore.setSecret).toHaveBeenCalledWith('legacy_token_123456')
        expect(mocks.writeConfig).toHaveBeenCalledWith({ currentWorkspace: 42 })
        expect(mocks.unlink).not.toHaveBeenCalled()
    })

    it('prefers the fallback config token over a stale secure-store token', async () => {
        mocks.secureTokenStore.getSecret.mockResolvedValue('stale_secure_token_123456')
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.readConfig.mockResolvedValue({
            token: 'fresh_config_token_123456',
            currentWorkspace: 42,
        })

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('fresh_config_token_123456')
        expect(mocks.secureTokenStore.setSecret).toHaveBeenCalledWith('fresh_config_token_123456')
        expect(mocks.secureTokenStore.getSecret).not.toHaveBeenCalled()
    })

    it('returns the migrated token even when config cleanup fails', async () => {
        mocks.secureTokenStore.getSecret.mockResolvedValue(null)
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 42,
        })
        mocks.writeConfig.mockRejectedValue(new Error('EACCES'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('legacy_token_123456')
        expect(errorSpy).toHaveBeenCalledWith(
            'Warning: Token was migrated to secure storage, but could not remove legacy plaintext token from /home/user/.config/twist-cli/config.json (EACCES)',
        )

        errorSpy.mockRestore()
    })

    it('writes tokens to the secure store by default', async () => {
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.readConfig.mockResolvedValue({})

        const { saveApiToken } = await import('./auth.js')

        await expect(saveApiToken(' secure_token_123456 ')).resolves.toEqual({
            storage: 'secure-store',
        })
        expect(mocks.secureTokenStore.setSecret).toHaveBeenCalledWith('secure_token_123456')
    })

    it('keeps secure-store success when plaintext cleanup fails after saving', async () => {
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 42,
        })
        mocks.writeConfig.mockRejectedValue(new Error('EACCES'))

        const { saveApiToken } = await import('./auth.js')

        await expect(saveApiToken('secure_token_123456')).resolves.toEqual({
            storage: 'secure-store',
            warning:
                'Token was stored securely, but could not remove legacy plaintext token from /home/user/.config/twist-cli/config.json (EACCES)',
        })
    })

    it('deletes tokens from the secure store and removes any legacy config token', async () => {
        mocks.secureTokenStore.deleteSecret.mockResolvedValue(true)
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 7,
        })

        const { clearApiToken } = await import('./auth.js')

        await expect(clearApiToken()).resolves.toEqual({ storage: 'secure-store' })
        expect(mocks.secureTokenStore.deleteSecret).toHaveBeenCalled()
        expect(mocks.writeConfig).toHaveBeenCalledWith({ currentWorkspace: 7 })
    })

    it('persists pending secure-store clear state when logout falls back to config', async () => {
        mocks.secureTokenStore.deleteSecret.mockRejectedValue(
            new mocks.MockSecureStoreUnavailableError('No keychain access'),
        )
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 7,
        })

        const { clearApiToken } = await import('./auth.js')

        await expect(clearApiToken()).resolves.toEqual({
            storage: 'config-file',
            warning:
                'system credential manager unavailable; local auth state cleared in /home/user/.config/twist-cli/config.json',
        })
        expect(mocks.writeConfig).toHaveBeenCalledWith({
            currentWorkspace: 7,
            pendingSecureStoreClear: true,
        })
    })

    it('falls back to plaintext config storage when the secure store is unavailable', async () => {
        mocks.secureTokenStore.setSecret.mockRejectedValue(
            new mocks.MockSecureStoreUnavailableError('No keychain access'),
        )
        mocks.readConfig.mockResolvedValue({})

        const { saveApiToken } = await import('./auth.js')

        await expect(saveApiToken('fallback_token_123456')).resolves.toEqual({
            storage: 'config-file',
            warning:
                'system credential manager unavailable; token saved as plaintext in /home/user/.config/twist-cli/config.json',
        })
        expect(mocks.writeConfig).toHaveBeenCalledWith({
            token: 'fallback_token_123456',
            authMode: 'unknown',
            authScope: undefined,
        })
    })

    it('reads from plaintext config silently when the secure store is unavailable', async () => {
        mocks.secureTokenStore.setSecret.mockRejectedValue(
            new mocks.MockSecureStoreUnavailableError('No keychain access'),
        )
        mocks.readConfig.mockResolvedValue({ token: 'legacy_token_123456' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('legacy_token_123456')
        expect(errorSpy).not.toHaveBeenCalled()

        errorSpy.mockRestore()
    })

    it('probes a legacy config token without migrating it', async () => {
        mocks.readConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            authMode: 'read-write',
            currentWorkspace: 42,
        })

        const { probeApiToken } = await import('./auth.js')

        await expect(probeApiToken()).resolves.toEqual({
            token: 'legacy_token_123456',
            metadata: {
                authMode: 'read-write',
                source: 'config-file',
            },
        })
        expect(mocks.secureTokenStore.setSecret).not.toHaveBeenCalled()
        expect(mocks.writeConfig).not.toHaveBeenCalled()
    })

    it('probes a secure-store token without mutating config', async () => {
        mocks.secureTokenStore.getSecret.mockResolvedValue('secure_token_123456')
        mocks.readConfig.mockResolvedValue({
            authMode: 'read-only',
            authScope: 'user:read',
            currentWorkspace: 42,
        })

        const { probeApiToken } = await import('./auth.js')

        await expect(probeApiToken()).resolves.toEqual({
            token: 'secure_token_123456',
            metadata: {
                authMode: 'read-only',
                authScope: 'user:read',
                source: 'secure-store',
            },
        })
        expect(mocks.secureTokenStore.getSecret).toHaveBeenCalled()
        expect(mocks.writeConfig).not.toHaveBeenCalled()
    })

    it('treats pending secure-store clear as logged out and does not reuse stale secure tokens', async () => {
        mocks.secureTokenStore.deleteSecret.mockResolvedValue(true)
        mocks.secureTokenStore.getSecret.mockResolvedValue('stale_secure_token_123456')
        mocks.readConfig.mockResolvedValue({
            pendingSecureStoreClear: true,
            currentWorkspace: 7,
        })

        const { getApiToken } = await import('./auth.js')

        await expect(getApiToken()).rejects.toThrow('No API token found')
        expect(mocks.secureTokenStore.deleteSecret).toHaveBeenCalled()
        expect(mocks.secureTokenStore.getSecret).not.toHaveBeenCalled()
        expect(mocks.writeConfig).toHaveBeenCalledWith({ currentWorkspace: 7 })
    })
})
