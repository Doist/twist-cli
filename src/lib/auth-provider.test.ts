import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({ createWrappedTwistClient: vi.fn() }))

const migrateMocks = vi.hoisted(() => ({
    runMigrateLegacyAuth: vi.fn(),
}))

vi.mock('./migrate-auth.js', () => migrateMocks)

const keyringMocks = vi.hoisted(() => ({
    createKeyringTokenStore: vi.fn(),
    createSecureStore: vi.fn(),
    createDcrProvider: vi.fn(),
    secureStoreGetSecret: vi.fn(),
    secureStoreDeleteSecret: vi.fn(),
    inner: {
        active: vi.fn(),
        activeBundle: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
        list: vi.fn(),
        setDefault: vi.fn(),
        getLastStorageResult: vi.fn(),
        getLastClearResult: vi.fn(),
    },
}))

vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    keyringMocks.createKeyringTokenStore.mockImplementation(() => keyringMocks.inner)
    keyringMocks.createSecureStore.mockImplementation(() => ({
        getSecret: keyringMocks.secureStoreGetSecret,
        setSecret: vi.fn(),
        deleteSecret: keyringMocks.secureStoreDeleteSecret,
    }))
    // Delegate to the real factory so the returned provider works, while
    // capturing the options createTwistAuthProvider passes (asserted below).
    keyringMocks.createDcrProvider.mockImplementation((options) =>
        actual.createDcrProvider(options),
    )
    return {
        ...actual,
        createKeyringTokenStore: keyringMocks.createKeyringTokenStore,
        createSecureStore: keyringMocks.createSecureStore,
        createDcrProvider: keyringMocks.createDcrProvider,
    }
})

const configMocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
}))

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfigPath: () => '/home/user/.config/twist-cli/config.json',
        getConfig: configMocks.getConfig,
        updateConfig: configMocks.updateConfig,
    }
})

import { createWrappedTwistClient } from './api.js'
import {
    createTwistAuthProvider,
    matchTwistAccount,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
} from './auth-provider.js'

const mockCreateClient = vi.mocked(createWrappedTwistClient)
const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

const STORED_ACCOUNT = {
    id: '42',
    label: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

const SKIPPED_RESULT = {
    status: 'skipped',
    reason: 'identify-failed',
    detail: 'offline',
} as const

const LEGACY_CONFIG = {
    authUserId: 42,
    authUserName: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

/** Reset the module-level migration memo for each test by re-importing. */
async function loadCreateTwistTokenStore(): Promise<
    typeof import('./auth-provider.js').createTwistTokenStore
> {
    vi.resetModules()
    const mod = await import('./auth-provider.js')
    return mod.createTwistTokenStore
}

describe('createTwistAuthProvider', () => {
    // clearAllMocks (not restoreAllMocks) so the createDcrProvider delegating
    // implementation set in the module mock survives between tests.
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('registers with client_secret_post so underscore client_ids survive token-endpoint auth', () => {
        createTwistAuthProvider()
        const options = keyringMocks.createDcrProvider.mock.calls.at(-1)?.[0]
        expect(options.clientMetadata.tokenEndpointAuthMethod).toBe('client_secret_post')
    })

    // Registration / authorize / token-exchange mechanics now live in cli-core's
    // createDcrProvider (covered by its own suite). The only twist-specific
    // behaviour is `validate`: probe getSessionUser, then derive authMode +
    // authScope from the folded `readOnly` (the scope set is a pure function of
    // it — see resolveScopes in login.ts).
    it('validate builds a TwistAccount, deriving read-write mode + scopes from the handshake', async () => {
        mockCreateClient.mockReturnValue({
            users: { getSessionUser: vi.fn().mockResolvedValue({ id: 42, name: 'Ada' }) },
        } as unknown as ReturnType<typeof createWrappedTwistClient>)

        const account = await createTwistAuthProvider().validateToken!({
            token: 'tk_new',
            handshake: { readOnly: false },
        })

        expect(mockCreateClient).toHaveBeenCalledWith('tk_new')
        expect(account).toEqual({
            id: '42',
            label: 'Ada',
            authMode: 'read-write',
            authScope: READ_WRITE_SCOPES.join(' '),
        })
    })

    it('validate derives read-only mode + scopes when the handshake carries readOnly', async () => {
        mockCreateClient.mockReturnValue({
            users: { getSessionUser: vi.fn().mockResolvedValue({ id: 7, name: 'Lin' }) },
        } as unknown as ReturnType<typeof createWrappedTwistClient>)

        const account = await createTwistAuthProvider().validateToken!({
            token: 'tk_ro',
            handshake: { readOnly: true },
        })

        expect(account.authMode).toBe('read-only')
        expect(account.authScope).toBe(READ_ONLY_SCOPES.join(' '))
    })

    it('validate fails closed (AUTH_FAILED) when the handshake has no boolean readOnly flag', async () => {
        // Guards ensureWriteAllowed: a missing flag must not silently become read-write.
        await expect(
            createTwistAuthProvider().validateToken!({ token: 'tk', handshake: {} }),
        ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
    })
})

describe('createTwistTokenStore', () => {
    beforeEach(() => {
        keyringMocks.createKeyringTokenStore.mockClear()
        keyringMocks.createSecureStore.mockClear()
        keyringMocks.secureStoreGetSecret.mockReset().mockResolvedValue(null)
        keyringMocks.secureStoreDeleteSecret.mockReset().mockResolvedValue(true)
        keyringMocks.inner.active.mockReset()
        keyringMocks.inner.activeBundle.mockReset().mockResolvedValue(null)
        keyringMocks.inner.set.mockReset().mockResolvedValue(undefined)
        keyringMocks.inner.clear.mockReset().mockResolvedValue(undefined)
        keyringMocks.inner.list.mockReset().mockResolvedValue([])
        keyringMocks.inner.setDefault.mockReset().mockResolvedValue(undefined)
        migrateMocks.runMigrateLegacyAuth
            .mockReset()
            .mockResolvedValue({ status: 'no-legacy-state' })
        configMocks.getConfig.mockReset().mockResolvedValue({})
        configMocks.updateConfig.mockReset().mockResolvedValue(undefined)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('passes twist-cli wiring to cli-core: serviceName, no accountForUser override (uses cli-core default `user-${id}`), records location, and the parseRef-aware matcher', async () => {
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        createTwistTokenStore()

        const options = keyringMocks.createKeyringTokenStore.mock.calls[0][0]
        expect(options.serviceName).toBe('twist-cli')
        expect(options.accountForUser).toBeUndefined()
        expect(options.recordsLocation).toBe('/home/user/.config/twist-cli/config.json')
        const { matchTwistAccount: matcher } = await import('./auth-provider.js')
        expect(options.matchAccount).toBe(matcher)
    })

    it('active() short-circuits to TWIST_API_TOKEN when no explicit ref is supplied (and never even awaits migration)', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot).toEqual({
            token: 'env_token_value',
            account: { id: '', label: '', authMode: 'unknown', authScope: '' },
        })
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
        expect(migrateMocks.runMigrateLegacyAuth).not.toHaveBeenCalled()
    })

    // cli-core's auth commands read the live credential via activeBundle(), so it
    // must apply the same env-token + legacy overrides as active() — otherwise
    // `tw auth status` mis-reports env-token / migration-pending users.
    it('activeBundle() short-circuits to TWIST_API_TOKEN, wrapped as a bundle', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().activeBundle()

        expect(snapshot).toEqual({
            account: { id: '', label: '', authMode: 'unknown', authScope: '' },
            bundle: { accessToken: 'env_token_value' },
        })
        expect(keyringMocks.inner.activeBundle).not.toHaveBeenCalled()
    })

    it('activeBundle() delegates to the v2 store when migration is conclusive', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({ status: 'no-legacy-state' })
        keyringMocks.inner.activeBundle.mockResolvedValue({
            account: STORED_ACCOUNT,
            bundle: { accessToken: 'tk_v2' },
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().activeBundle('42')

        expect(snapshot).toEqual({ account: STORED_ACCOUNT, bundle: { accessToken: 'tk_v2' } })
        expect(keyringMocks.inner.activeBundle).toHaveBeenCalledWith('42')
    })

    it('active() ignores TWIST_API_TOKEN when an explicit --user ref targets a stored account', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')
        keyringMocks.inner.active.mockResolvedValue({ token: 'tk_stored', account: STORED_ACCOUNT })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        await createTwistTokenStore().active('42')

        expect(keyringMocks.inner.active).toHaveBeenCalledWith('42')
    })

    it('runs runMigrateLegacyAuth on the first store access and memoises across subsequent calls', async () => {
        keyringMocks.inner.active.mockResolvedValue(null)
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        const store = createTwistTokenStore()

        await store.active('42')
        await store.list()
        await store.clear('42')
        await store.set(STORED_ACCOUNT, 'tk')
        await store.setDefault('42')

        // Memoised: migration must run exactly once across mixed reads + writes.
        expect(migrateMocks.runMigrateLegacyAuth).toHaveBeenCalledTimes(1)
        expect(migrateMocks.runMigrateLegacyAuth).toHaveBeenCalledWith({ silent: true })
    })

    it('falls back to the legacy api-token keyring slot when migration is skipped (offline `identifyAccount`)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue(SKIPPED_RESULT)
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue(LEGACY_CONFIG)
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(keyringMocks.createSecureStore).toHaveBeenCalledWith({
            serviceName: 'twist-cli',
            account: 'api-token',
        })
        expect(snapshot).toEqual({
            token: 'tk_legacy_keyring',
            account: { id: '42', label: 'Ada', authMode: 'read-write', authScope: 'user:read' },
        })
        // v2 path is not consulted when the legacy fallback succeeded.
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
    })

    it('falls back to plaintext config.token when migration is skipped and the keyring is empty', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue(SKIPPED_RESULT)
        configMocks.getConfig.mockResolvedValue({
            ...LEGACY_CONFIG,
            token: '  tk_legacy_plaintext  ',
            authMode: 'read-only',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot?.token).toBe('tk_legacy_plaintext')
        expect(snapshot?.account.authMode).toBe('read-only')
    })

    it('delegates to the v2 store when migration is conclusive (no-legacy-state) — no legacy read attempt', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({ status: 'no-legacy-state' })
        keyringMocks.inner.active.mockResolvedValue({ token: 'tk_v2', account: STORED_ACCOUNT })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot).toEqual({ token: 'tk_v2', account: STORED_ACCOUNT })
        expect(keyringMocks.createSecureStore).not.toHaveBeenCalled()
    })

    it('falls back to legacy when runMigrateLegacyAuth rejects (catch branch of ensureMigrated)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockRejectedValue(new Error('boom'))
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue(LEGACY_CONFIG)
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot?.token).toBe('tk_legacy_keyring')
        expect(snapshot?.account.id).toBe('42')
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
    })

    it('legacy snapshot synthesises account.id = "" for `tw auth token <token>` users with no authUserId on disk', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue(SKIPPED_RESULT)
        configMocks.getConfig.mockResolvedValue({ token: 'tk_token_only', authMode: 'unknown' })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot?.account.id).toBe('')
        expect(snapshot?.account.label).toBe('')
    })

    it('active(ref) returns the legacy snapshot when ref matches, falls through to v2 when it doesn’t', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue(SKIPPED_RESULT)
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue(LEGACY_CONFIG)
        keyringMocks.inner.active.mockResolvedValue(null)
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        const store = createTwistTokenStore()

        const matched = await store.active('42')
        expect(matched?.token).toBe('tk_legacy_keyring')

        const mismatched = await store.active('999')
        expect(mismatched).toBeNull()
        expect(keyringMocks.inner.active).toHaveBeenCalledWith('999')
    })

    it('set() / clear() discharge legacy state on disk when migration is inconclusive', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue(SKIPPED_RESULT)
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        const store = createTwistTokenStore()

        await store.set(STORED_ACCOUNT, 'tk_new')
        await store.clear('42')

        expect(keyringMocks.secureStoreDeleteSecret).toHaveBeenCalledTimes(2)
        expect(configMocks.updateConfig).toHaveBeenCalledWith({
            token: undefined,
            authMode: undefined,
            authScope: undefined,
            authUserId: undefined,
            authUserName: undefined,
            pendingSecureStoreClear: undefined,
        })
        expect(keyringMocks.inner.set).toHaveBeenCalledWith(STORED_ACCOUNT, 'tk_new')
        expect(keyringMocks.inner.clear).toHaveBeenCalledWith('42')
    })

    it('set() / clear() do NOT touch legacy state when migration is conclusive (no needless writes on the happy path)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({ status: 'no-legacy-state' })
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        const store = createTwistTokenStore()

        await store.set(STORED_ACCOUNT, 'tk_new')
        await store.clear('42')

        expect(keyringMocks.secureStoreDeleteSecret).not.toHaveBeenCalled()
        expect(configMocks.updateConfig).not.toHaveBeenCalled()
    })
})

describe('matchTwistAccount', () => {
    it('matches numeric ids, `id:<n>` prefix form, and case-insensitive labels', () => {
        expect(matchTwistAccount(STORED_ACCOUNT, '42')).toBe(true)
        expect(matchTwistAccount(STORED_ACCOUNT, 'id:42')).toBe(true)
        expect(matchTwistAccount(STORED_ACCOUNT, 'ADA')).toBe(true)
        expect(matchTwistAccount(STORED_ACCOUNT, '999')).toBe(false)
        expect(matchTwistAccount(STORED_ACCOUNT, 'someone-else')).toBe(false)
    })
})
