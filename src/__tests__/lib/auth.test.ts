import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    class MockSecureStoreUnavailableError extends Error {}

    return {
        MockSecureStoreUnavailableError,
        getConfig: vi.fn(),
        getConfigPath: vi.fn(() => '/home/user/.config/twist-cli/config.json'),
        secureTokenStore: {
            getSecret: vi.fn(),
            setSecret: vi.fn(),
            deleteSecret: vi.fn(),
        },
        setConfig: vi.fn(),
        unlink: vi.fn(),
        updateConfig: vi.fn(),
    }
})

vi.mock('../../lib/config.js', () => ({
    getConfig: mocks.getConfig,
    getConfigPath: mocks.getConfigPath,
    setConfig: mocks.setConfig,
    updateConfig: mocks.updateConfig,
}))

vi.mock('../../lib/secure-store.js', () => ({
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
        mocks.getConfig.mockReset()
        mocks.setConfig.mockReset()
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

        const { getApiToken } = await import('../../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('env_token_123456')
        expect(mocks.secureTokenStore.getSecret).not.toHaveBeenCalled()
        expect(mocks.getConfig).not.toHaveBeenCalled()
    })

    it('migrates a legacy plaintext config token into the secure store', async () => {
        mocks.secureTokenStore.getSecret.mockResolvedValue(null)
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.getConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 42,
        })

        const { getApiToken } = await import('../../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('legacy_token_123456')
        expect(mocks.secureTokenStore.setSecret).toHaveBeenCalledWith('legacy_token_123456')
        expect(mocks.setConfig).toHaveBeenCalledWith({ currentWorkspace: 42 })
        expect(mocks.unlink).not.toHaveBeenCalled()
    })

    it('writes tokens to the secure store by default', async () => {
        mocks.secureTokenStore.setSecret.mockResolvedValue(undefined)
        mocks.getConfig.mockResolvedValue({})

        const { saveApiToken } = await import('../../lib/auth.js')

        await expect(saveApiToken(' secure_token_123456 ')).resolves.toEqual({
            storage: 'secure-store',
        })
        expect(mocks.secureTokenStore.setSecret).toHaveBeenCalledWith('secure_token_123456')
    })

    it('deletes tokens from the secure store and removes any legacy config token', async () => {
        mocks.secureTokenStore.deleteSecret.mockResolvedValue(true)
        mocks.getConfig.mockResolvedValue({
            token: 'legacy_token_123456',
            currentWorkspace: 7,
        })

        const { clearApiToken } = await import('../../lib/auth.js')

        await expect(clearApiToken()).resolves.toEqual({ storage: 'secure-store' })
        expect(mocks.secureTokenStore.deleteSecret).toHaveBeenCalled()
        expect(mocks.setConfig).toHaveBeenCalledWith({ currentWorkspace: 7 })
    })

    it('falls back to plaintext config storage when the secure store is unavailable', async () => {
        mocks.secureTokenStore.setSecret.mockRejectedValue(
            new mocks.MockSecureStoreUnavailableError('No keychain access'),
        )
        mocks.getConfig.mockResolvedValue({})

        const { saveApiToken } = await import('../../lib/auth.js')

        await expect(saveApiToken('fallback_token_123456')).resolves.toEqual({
            storage: 'config-file',
            warning:
                'system credential manager unavailable; token saved as plaintext in /home/user/.config/twist-cli/config.json',
        })
        expect(mocks.setConfig).toHaveBeenCalledWith({ token: 'fallback_token_123456' })
    })

    it('reads from plaintext config with a warning when the secure store is unavailable', async () => {
        mocks.secureTokenStore.getSecret.mockRejectedValue(
            new mocks.MockSecureStoreUnavailableError('No keychain access'),
        )
        mocks.getConfig.mockResolvedValue({ token: 'legacy_token_123456' })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { getApiToken } = await import('../../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('legacy_token_123456')
        expect(errorSpy).toHaveBeenCalledWith(
            'Warning: system credential manager unavailable; using plaintext token from /home/user/.config/twist-cli/config.json',
        )

        errorSpy.mockRestore()
    })
})
