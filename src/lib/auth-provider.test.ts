import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./auth.js')>()
    return {
        ...actual,
        probeApiToken: vi.fn(),
        saveApiToken: vi.fn(),
        clearApiToken: vi.fn(),
    }
})

vi.mock('./api.js', () => ({ createWrappedTwistClient: vi.fn() }))

import { createWrappedTwistClient } from './api.js'
import {
    AUTHORIZATION_URL,
    createTwistAuthProvider,
    createTwistTokenStore,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
    REGISTRATION_URL,
    TOKEN_URL,
} from './auth-provider.js'
import { clearApiToken, NoTokenError, probeApiToken, saveApiToken } from './auth.js'

const REDIRECT_URI = 'http://127.0.0.1:8766/callback'
const mockProbe = vi.mocked(probeApiToken)
const mockSave = vi.mocked(saveApiToken)
const mockClear = vi.mocked(clearApiToken)
const mockCreateClient = vi.mocked(createWrappedTwistClient)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

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
    afterEach(() => {
        mockProbe.mockReset()
        mockSave.mockReset()
        mockClear.mockReset()
    })

    it('active() returns null when no token is stored', async () => {
        mockProbe.mockRejectedValueOnce(new NoTokenError())
        expect(await createTwistTokenStore().active()).toBeNull()
    })

    it('active() returns null when the system keyring is unavailable', async () => {
        const { SecureStoreUnavailableError } = await import('./secure-store.js')
        mockProbe.mockRejectedValueOnce(new SecureStoreUnavailableError('no keyring'))
        expect(await createTwistTokenStore().active()).toBeNull()
    })

    it('active() returns a token-only snapshot with placeholder fields when no identity is persisted', async () => {
        mockProbe.mockResolvedValueOnce({
            token: 'tk_env',
            metadata: { authMode: 'unknown', source: 'env' },
        })
        expect(await createTwistTokenStore().active()).toEqual({
            token: 'tk_env',
            account: {
                id: '',
                label: '',
                authMode: 'unknown',
                authScope: '',
            },
        })
    })

    it('active() rebuilds a real TwistAccount from persisted identity', async () => {
        mockProbe.mockResolvedValue({
            token: 'tk_xyz',
            metadata: {
                authMode: 'read-only',
                authScope: 'user:read',
                authUserId: 42,
                authUserName: 'Ada',
                source: 'secure-store',
            },
        })
        expect(await createTwistTokenStore().active()).toEqual({
            token: 'tk_xyz',
            account: {
                id: '42',
                label: 'Ada',
                authMode: 'read-only',
                authScope: 'user:read',
            },
        })
    })

    it('set() persists token + authMode/scope/userId/userName and exposes the result', async () => {
        mockSave.mockResolvedValue({ storage: 'secure-store' })
        const store = createTwistTokenStore()
        await store.set(
            { id: '42', label: 'Ada', authMode: 'read-write', authScope: 'user:read' },
            'tk_new',
        )
        expect(mockSave).toHaveBeenCalledWith('tk_new', {
            authMode: 'read-write',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
        })
        expect(store.getLastStorageResult()).toEqual({ storage: 'secure-store' })
    })

    it('clear() delegates to clearApiToken and exposes the result', async () => {
        mockClear.mockResolvedValue({ storage: 'secure-store' })
        const store = createTwistTokenStore()
        await store.clear()
        expect(mockClear).toHaveBeenCalledTimes(1)
        expect(store.getLastClearResult()).toEqual({ storage: 'secure-store' })
    })

    describe('ref-aware lookups', () => {
        const STORED_METADATA = {
            authMode: 'read-write' as const,
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'config-file' as const,
        }
        const STORED_ACCOUNT = {
            id: '42',
            label: 'Ada',
            authMode: 'read-write' as const,
            authScope: 'user:read',
        }

        it('active(ref) returns the snapshot when the numeric id ref matches', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            expect(await createTwistTokenStore().active('42')).toEqual({
                token: 'tk',
                account: STORED_ACCOUNT,
            })
        })

        it('active(ref) accepts the id:<n> form normalised by parseRef', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            expect(await createTwistTokenStore().active('id:42')).toEqual({
                token: 'tk',
                account: STORED_ACCOUNT,
            })
        })

        it('active(ref) matches the stored label case-insensitively', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            expect(await createTwistTokenStore().active('ADA')).toEqual({
                token: 'tk',
                account: STORED_ACCOUNT,
            })
        })

        it('active(ref) throws ACCOUNT_NOT_FOUND on mismatch so status surfaces a distinct error', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            await expect(createTwistTokenStore().active('other')).rejects.toMatchObject({
                code: 'ACCOUNT_NOT_FOUND',
            })
        })

        it('active(ref) throws ACCOUNT_NOT_FOUND when no token is stored at all', async () => {
            mockProbe.mockRejectedValueOnce(new NoTokenError())
            await expect(createTwistTokenStore().active('42')).rejects.toMatchObject({
                code: 'ACCOUNT_NOT_FOUND',
            })
        })

        it('active(ref) surfaces a secure-store outage instead of masking it as ACCOUNT_NOT_FOUND', async () => {
            const { SecureStoreUnavailableError } = await import('./secure-store.js')
            mockProbe.mockRejectedValueOnce(new SecureStoreUnavailableError('no keyring'))
            await expect(createTwistTokenStore().active('42')).rejects.toBeInstanceOf(
                SecureStoreUnavailableError,
            )
        })

        it('clear(ref) clears storage when the ref matches', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            mockClear.mockResolvedValueOnce({ storage: 'secure-store' })
            const store = createTwistTokenStore()
            await store.clear('42')
            expect(mockClear).toHaveBeenCalledTimes(1)
            expect(store.getLastClearResult()).toEqual({ storage: 'secure-store' })
        })

        it('clear(ref) throws ACCOUNT_NOT_FOUND on mismatch and does not touch storage', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            const store = createTwistTokenStore()
            await expect(store.clear('other')).rejects.toMatchObject({
                code: 'ACCOUNT_NOT_FOUND',
            })
            expect(mockClear).not.toHaveBeenCalled()
        })

        it('list() returns the single stored account flagged as default', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            expect(await createTwistTokenStore().list()).toEqual([
                { account: STORED_ACCOUNT, isDefault: true },
            ])
        })

        it('list() returns an empty array when no token is stored', async () => {
            mockProbe.mockRejectedValueOnce(new NoTokenError())
            expect(await createTwistTokenStore().list()).toEqual([])
        })

        it('list() propagates secure-store outage rather than collapsing to "no accounts"', async () => {
            const { SecureStoreUnavailableError } = await import('./secure-store.js')
            mockProbe.mockRejectedValueOnce(new SecureStoreUnavailableError('no keyring'))
            await expect(createTwistTokenStore().list()).rejects.toBeInstanceOf(
                SecureStoreUnavailableError,
            )
        })

        it('setDefault(ref) resolves silently when the ref matches the one stored account', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            await expect(createTwistTokenStore().setDefault('42')).resolves.toBeUndefined()
        })

        it('setDefault(ref) throws ACCOUNT_NOT_FOUND when the ref does not match', async () => {
            mockProbe.mockResolvedValueOnce({ token: 'tk', metadata: STORED_METADATA })
            await expect(createTwistTokenStore().setDefault('other')).rejects.toMatchObject({
                code: 'ACCOUNT_NOT_FOUND',
            })
        })
    })
})
