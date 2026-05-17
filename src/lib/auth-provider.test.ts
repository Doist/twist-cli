import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({ createWrappedTwistClient: vi.fn() }))

const migrateMocks = vi.hoisted(() => ({
    runMigrateLegacyAuth: vi.fn(),
}))

vi.mock('./migrate-auth.js', () => migrateMocks)

const keyringMocks = vi.hoisted(() => ({
    createKeyringTokenStore: vi.fn(),
    createSecureStore: vi.fn(),
    secureStoreGetSecret: vi.fn(),
    secureStoreDeleteSecret: vi.fn(),
    inner: {
        active: vi.fn(),
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
    return {
        ...actual,
        createKeyringTokenStore: keyringMocks.createKeyringTokenStore,
        createSecureStore: keyringMocks.createSecureStore,
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
    AUTHORIZATION_URL,
    createTwistAuthProvider,
    matchTwistAccount,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
    REGISTRATION_URL,
    TOKEN_URL,
} from './auth-provider.js'

const REDIRECT_URI = 'http://127.0.0.1:8766/callback'
const mockCreateClient = vi.mocked(createWrappedTwistClient)
const TOKEN_ENV_VAR = 'TWIST_API_TOKEN'

const STORED_ACCOUNT = {
    id: '42',
    label: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/**
 * `createTwistTokenStore` memoises a module-level migration promise. To
 * exercise the cold-cache path in each test (and avoid shipping a
 * test-only reset export from the production module) we reset the
 * module registry and re-import. Mocks declared above re-apply on
 * re-import.
 */
async function loadCreateTwistTokenStore(): Promise<
    typeof import('./auth-provider.js').createTwistTokenStore
> {
    vi.resetModules()
    const mod = await import('./auth-provider.js')
    return mod.createTwistTokenStore
}

describe('createTwistAuthProvider', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch')
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('prepare POSTs the DCR payload and surfaces clientId/clientSecret on the handshake', async () => {
        fetchSpy.mockResolvedValue(json({ client_id: 'twd_abc', client_secret: 'shh' }))

        const result = await createTwistAuthProvider().prepare!({
            redirectUri: REDIRECT_URI,
            flags: {},
        })

        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe(REGISTRATION_URL)
        expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
            client_name: 'Twist CLI',
            redirect_uris: [REDIRECT_URI],
            token_endpoint_auth_method: 'client_secret_basic',
        })
        expect(result.handshake).toEqual({ clientId: 'twd_abc', clientSecret: 'shh' })
    })

    it('prepare rewraps fetch rejections + bad responses as AUTH_FAILED', async () => {
        const provider = createTwistAuthProvider()
        const ctx = { redirectUri: REDIRECT_URI, flags: {} }

        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
        await expect(provider.prepare!(ctx)).rejects.toMatchObject({ code: 'AUTH_FAILED' })

        fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }))
        await expect(provider.prepare!(ctx)).rejects.toMatchObject({ code: 'AUTH_FAILED' })

        fetchSpy.mockResolvedValueOnce(json({ client_id: 'only' }))
        await expect(provider.prepare!(ctx)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
    })

    it('authorize builds the twist URL with PKCE params and threads verifier + authMode forward', async () => {
        const result = await createTwistAuthProvider().authorize({
            redirectUri: REDIRECT_URI,
            state: 'state-xyz',
            scopes: READ_WRITE_SCOPES,
            readOnly: false,
            flags: {},
            handshake: { clientId: 'twd_abc', clientSecret: 'shh' },
        })

        const url = new URL(result.authorizeUrl)
        expect(result.authorizeUrl.startsWith(AUTHORIZATION_URL)).toBe(true)
        expect(url.searchParams.get('client_id')).toBe('twd_abc')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        expect(url.searchParams.get('code_challenge')).toBeTruthy()
        expect(url.searchParams.get('scope')).toBe(READ_WRITE_SCOPES.join(' '))

        const hs = result.handshake as Record<string, unknown>
        expect((hs.codeVerifier as string).length).toBeGreaterThan(40)
        expect(hs.authMode).toBe('read-write')
    })

    it('authorize marks authMode read-only when readOnly is true', async () => {
        const result = await createTwistAuthProvider().authorize({
            redirectUri: REDIRECT_URI,
            state: 's',
            scopes: READ_ONLY_SCOPES,
            readOnly: true,
            flags: {},
            handshake: { clientId: 'c', clientSecret: 's' },
        })
        expect((result.handshake as Record<string, unknown>).authMode).toBe('read-only')
    })

    it('exchangeCode POSTs to the token endpoint with HTTP Basic auth and the PKCE verifier', async () => {
        fetchSpy.mockResolvedValue(json({ access_token: 'tk_123' }))

        const result = await createTwistAuthProvider().exchangeCode({
            code: 'auth-code',
            state: 's',
            redirectUri: REDIRECT_URI,
            handshake: { clientId: 'twd_abc', clientSecret: 'shh', codeVerifier: 'verif-1' },
        })

        expect(result).toEqual({ accessToken: 'tk_123' })
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe(TOKEN_URL)
        const headers = (init as RequestInit).headers as Record<string, string>
        expect(headers.Authorization).toBe(`Basic ${Buffer.from('twd_abc:shh').toString('base64')}`)
        const body = new URLSearchParams((init as RequestInit).body as string)
        expect(body.get('code')).toBe('auth-code')
        expect(body.get('code_verifier')).toBe('verif-1')
    })

    it('exchangeCode rewraps fetch rejections, bad responses, and missing-verifier as AUTH_FAILED', async () => {
        const provider = createTwistAuthProvider()
        const goodHs = { clientId: 'a', clientSecret: 'b', codeVerifier: 'v' }
        const base = { code: 'c', state: 's', redirectUri: REDIRECT_URI }

        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
        await expect(provider.exchangeCode({ ...base, handshake: goodHs })).rejects.toMatchObject({
            code: 'AUTH_FAILED',
        })

        fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 400 }))
        await expect(provider.exchangeCode({ ...base, handshake: goodHs })).rejects.toMatchObject({
            code: 'AUTH_FAILED',
        })

        // Guard: missing verifier means authorize() was never run — never hits fetch.
        await expect(
            provider.exchangeCode({ ...base, handshake: { clientId: 'a', clientSecret: 'b' } }),
        ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
    })

    it('validateToken fetches getSessionUser with the new token and returns a narrow TwistAccount', async () => {
        mockCreateClient.mockReturnValue({
            users: { getSessionUser: vi.fn().mockResolvedValue({ id: 42, name: 'Ada' }) },
        } as unknown as ReturnType<typeof createWrappedTwistClient>)

        const account = await createTwistAuthProvider().validateToken({
            token: 'tk_new',
            handshake: { authMode: 'read-write', authScope: 'user:read' },
        })

        expect(mockCreateClient).toHaveBeenCalledWith('tk_new')
        expect(account).toEqual({
            id: '42',
            label: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
    })
})

describe('createTwistTokenStore', () => {
    beforeEach(() => {
        keyringMocks.createKeyringTokenStore.mockClear()
        keyringMocks.createSecureStore.mockClear()
        keyringMocks.secureStoreGetSecret.mockReset().mockResolvedValue(null)
        keyringMocks.secureStoreDeleteSecret.mockReset().mockResolvedValue(true)
        keyringMocks.inner.active.mockReset()
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

    it('passes twist-cli wiring to cli-core: serviceName, no accountForUser override (cli-core default user-${id} is used after γ1), the user-records adapter, the records location, and the parseRef-aware matcher', async () => {
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

    it('active() ignores TWIST_API_TOKEN when an explicit --user ref targets a stored account', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')
        keyringMocks.inner.active.mockResolvedValue({ token: 'tk_stored', account: STORED_ACCOUNT })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        await createTwistTokenStore().active('42')

        expect(keyringMocks.inner.active).toHaveBeenCalledWith('42')
    })

    it('runs runMigrateLegacyAuth on the first store access and memoises across subsequent calls', async () => {
        keyringMocks.inner.active.mockResolvedValue(null)
        keyringMocks.inner.list.mockResolvedValue([])
        keyringMocks.inner.clear.mockResolvedValue(undefined)
        keyringMocks.inner.set.mockResolvedValue(undefined)
        keyringMocks.inner.setDefault.mockResolvedValue(undefined)
        const createTwistTokenStore = await loadCreateTwistTokenStore()
        const store = createTwistTokenStore()

        await store.active('42')
        await store.list()
        await store.clear('42')
        await store.set(STORED_ACCOUNT, 'tk')
        await store.setDefault('42')

        // Migration runs exactly once even across mixed reads + writes — that's
        // the "memoised" half of the contract. If it re-ran per call we'd
        // double-charge the cold-cache penalty on every CLI invocation.
        expect(migrateMocks.runMigrateLegacyAuth).toHaveBeenCalledTimes(1)
        expect(migrateMocks.runMigrateLegacyAuth).toHaveBeenCalledWith({ silent: true })
    })

    it('falls back to the legacy api-token keyring slot when migration is skipped (offline `identifyAccount`)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue({
            authUserId: 42,
            authUserName: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(keyringMocks.createSecureStore).toHaveBeenCalledWith({
            serviceName: 'twist-cli',
            account: 'api-token',
        })
        expect(snapshot).toEqual({
            token: 'tk_legacy_keyring',
            account: {
                id: '42',
                label: 'Ada',
                authMode: 'read-write',
                authScope: 'user:read',
            },
        })
        // v2 path is not consulted when the legacy fallback succeeded.
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
    })

    it('falls back to the legacy plaintext config.token when migration is skipped and the keyring is empty', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        keyringMocks.secureStoreGetSecret.mockResolvedValue(null)
        configMocks.getConfig.mockResolvedValue({
            token: '  tk_legacy_plaintext  ',
            authUserId: 42,
            authUserName: 'Ada',
            authMode: 'read-only',
            authScope: 'user:read',
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

    it('falls back to legacy when runMigrateLegacyAuth itself rejects (the catch branch of ensureMigrated)', async () => {
        // Exercises the `catch(() => null)` swallow inside `ensureMigrated`.
        // Without this branch a thrown migration would propagate and the CLI
        // would crash on first invocation post-upgrade for users with a
        // half-broken keyring / disk.
        migrateMocks.runMigrateLegacyAuth.mockRejectedValue(new Error('boom'))
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue({
            authUserId: 42,
            authUserName: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot?.token).toBe('tk_legacy_keyring')
        expect(snapshot?.account.id).toBe('42')
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
    })

    it('legacy snapshot synthesises account.id = "" for `tw auth token <token>` users with no authUserId (preserves the pre-γ1 single-user adapter behaviour)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        configMocks.getConfig.mockResolvedValue({
            token: 'tk_token_only',
            authMode: 'unknown',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active()

        expect(snapshot?.account.id).toBe('')
        expect(snapshot?.account.label).toBe('')
    })

    it('active(ref) ignores the legacy snapshot when an explicit --user targets a different account', async () => {
        // Without this guard `tw <cmd> --user 999` while offline would silently
        // authenticate as the default legacy user (id 42) instead of failing
        // with the expected account-not-found outcome.
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue({
            authUserId: 42,
            authUserName: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        keyringMocks.inner.active.mockResolvedValue(null)
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active('999')

        expect(keyringMocks.inner.active).toHaveBeenCalledWith('999')
        expect(snapshot).toBeNull()
    })

    it('active(ref) returns the legacy snapshot when the ref matches the legacy account', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        keyringMocks.secureStoreGetSecret.mockResolvedValue('tk_legacy_keyring')
        configMocks.getConfig.mockResolvedValue({
            authUserId: 42,
            authUserName: 'Ada',
            authMode: 'read-write',
            authScope: 'user:read',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        const snapshot = await createTwistTokenStore().active('42')

        expect(snapshot?.token).toBe('tk_legacy_keyring')
        expect(keyringMocks.inner.active).not.toHaveBeenCalled()
    })

    it('set() discharges legacy state on disk before writing v2, when migration is inconclusive', async () => {
        // Without this, a manual `tw auth token <new>` during the offline
        // window would land in v2 but the next invocation would still read
        // the unchanged legacy token via the active() fallback path.
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        await createTwistTokenStore().set(STORED_ACCOUNT, 'tk_new')

        expect(keyringMocks.secureStoreDeleteSecret).toHaveBeenCalledTimes(1)
        expect(configMocks.updateConfig).toHaveBeenCalledWith({
            token: undefined,
            authMode: undefined,
            authScope: undefined,
            authUserId: undefined,
            authUserName: undefined,
            pendingSecureStoreClear: undefined,
        })
        expect(keyringMocks.inner.set).toHaveBeenCalledWith(STORED_ACCOUNT, 'tk_new')
    })

    it('clear() discharges legacy state when migration is inconclusive (so logout actually logs the user out)', async () => {
        migrateMocks.runMigrateLegacyAuth.mockResolvedValue({
            status: 'skipped',
            reason: 'identify-failed',
            detail: 'offline',
        })
        const createTwistTokenStore = await loadCreateTwistTokenStore()

        await createTwistTokenStore().clear('42')

        expect(keyringMocks.secureStoreDeleteSecret).toHaveBeenCalledTimes(1)
        expect(configMocks.updateConfig).toHaveBeenCalled()
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
