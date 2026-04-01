import { beforeEach, describe, expect, it, vi } from 'vitest'

const keyringMocks = vi.hoisted(() => {
    const entry = {
        getPassword: vi.fn(),
        setPassword: vi.fn(),
        deleteCredential: vi.fn(),
    }

    return {
        AsyncEntry: vi.fn().mockImplementation(function AsyncEntry() {
            return entry
        }),
        entry,
    }
})

vi.mock('@napi-rs/keyring', () => ({
    AsyncEntry: keyringMocks.AsyncEntry,
}))

describe('secure token store', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
    })

    it('reads, writes, and deletes tokens via the system credential manager', async () => {
        keyringMocks.entry.getPassword.mockResolvedValue('secure_token_123456')
        keyringMocks.entry.setPassword.mockResolvedValue(undefined)
        keyringMocks.entry.deleteCredential.mockResolvedValue(true)

        const { createSecureStore } = await import('../../lib/secure-store.js')

        const store = createSecureStore()

        await expect(store.getSecret()).resolves.toBe('secure_token_123456')
        await expect(store.setSecret('secure_token_123456')).resolves.toBeUndefined()
        await expect(store.deleteSecret()).resolves.toBe(true)

        expect(keyringMocks.AsyncEntry).toHaveBeenCalledWith('twist-cli', 'api-token')
        expect(keyringMocks.entry.setPassword).toHaveBeenCalledWith('secure_token_123456')
    })

    it('wraps keyring errors as secure-store unavailability', async () => {
        keyringMocks.entry.getPassword.mockRejectedValue(new Error('Keychain is locked'))

        const { createSecureStore, SecureStoreUnavailableError } =
            await import('../../lib/secure-store.js')

        await expect(createSecureStore().getSecret()).rejects.toBeInstanceOf(
            SecureStoreUnavailableError,
        )
    })
})
