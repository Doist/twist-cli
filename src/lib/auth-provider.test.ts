import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', () => ({
    NoTokenError: class NoTokenError extends Error {
        constructor() {
            super('No API token found')
            this.name = 'NoTokenError'
        }
    },
    probeApiToken: vi.fn(),
    saveApiToken: vi.fn(),
    clearApiToken: vi.fn(),
}))

vi.mock('./api.js', () => ({
    createWrappedTwistClient: vi.fn(),
}))

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

const mockProbeApiToken = vi.mocked(probeApiToken)
const mockSaveApiToken = vi.mocked(saveApiToken)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockCreateClient = vi.mocked(createWrappedTwistClient)

describe('createTwistAuthProvider', () => {
    const REDIRECT_URI = 'http://127.0.0.1:8766/callback'
    let fetchSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('prepare (dynamic client registration)', () => {
        it('POSTs the twist DCR payload and returns clientId/clientSecret on the handshake', async () => {
            fetchSpy.mockResolvedValue(
                new Response(JSON.stringify({ client_id: 'twd_abc', client_secret: 'shh' }), {
                    status: 200,
                }),
            )

            const provider = createTwistAuthProvider()
            const result = await provider.prepare!({ redirectUri: REDIRECT_URI, flags: {} })

            expect(fetchSpy).toHaveBeenCalledTimes(1)
            const [url, init] = fetchSpy.mock.calls[0]
            expect(url).toBe(REGISTRATION_URL)
            const body = JSON.parse((init as RequestInit).body as string)
            expect(body).toMatchObject({
                client_name: 'Twist CLI',
                redirect_uris: [REDIRECT_URI],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'client_secret_basic',
                application_type: 'native',
            })
            expect(result.handshake).toEqual({ clientId: 'twd_abc', clientSecret: 'shh' })
        })

        it('throws AUTH_FAILED CliError on a non-2xx registration response', async () => {
            fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }))

            const provider = createTwistAuthProvider()
            await expect(
                provider.prepare!({ redirectUri: REDIRECT_URI, flags: {} }),
            ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
        })

        it('throws when the response is missing client_id or client_secret', async () => {
            fetchSpy.mockResolvedValue(
                new Response(JSON.stringify({ client_id: 'only-id' }), { status: 200 }),
            )

            const provider = createTwistAuthProvider()
            await expect(
                provider.prepare!({ redirectUri: REDIRECT_URI, flags: {} }),
            ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
        })
    })

    describe('authorize', () => {
        it('builds the twist authorize URL with PKCE params and threads verifier + authMode forward', async () => {
            const provider = createTwistAuthProvider()
            const handshake = { clientId: 'twd_abc', clientSecret: 'shh' }
            const result = await provider.authorize({
                redirectUri: REDIRECT_URI,
                state: 'state-xyz',
                scopes: READ_WRITE_SCOPES,
                readOnly: false,
                flags: {},
                handshake,
            })

            expect(result.authorizeUrl.startsWith(AUTHORIZATION_URL)).toBe(true)
            const url = new URL(result.authorizeUrl)
            expect(url.searchParams.get('client_id')).toBe('twd_abc')
            expect(url.searchParams.get('response_type')).toBe('code')
            expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
            expect(url.searchParams.get('state')).toBe('state-xyz')
            expect(url.searchParams.get('code_challenge_method')).toBe('S256')
            expect(url.searchParams.get('code_challenge')).toBeTruthy()
            expect(url.searchParams.get('scope')).toBe(READ_WRITE_SCOPES.join(' '))

            const hs = result.handshake as Record<string, unknown>
            expect(typeof hs.codeVerifier).toBe('string')
            expect((hs.codeVerifier as string).length).toBeGreaterThan(40)
            expect(hs.authMode).toBe('read-write')
            expect(hs.authScope).toBe(READ_WRITE_SCOPES.join(' '))
        })

        it('marks authMode = "read-only" when readOnly is true', async () => {
            const provider = createTwistAuthProvider()
            const result = await provider.authorize({
                redirectUri: REDIRECT_URI,
                state: 's',
                scopes: READ_ONLY_SCOPES,
                readOnly: true,
                flags: {},
                handshake: { clientId: 'c', clientSecret: 's' },
            })
            expect((result.handshake as Record<string, unknown>).authMode).toBe('read-only')
        })
    })

    describe('exchangeCode', () => {
        it('POSTs to the token endpoint with HTTP Basic auth and PKCE verifier', async () => {
            fetchSpy.mockResolvedValue(
                new Response(JSON.stringify({ access_token: 'tk_123' }), { status: 200 }),
            )

            const provider = createTwistAuthProvider()
            const result = await provider.exchangeCode({
                code: 'auth-code',
                state: 's',
                redirectUri: REDIRECT_URI,
                handshake: {
                    clientId: 'twd_abc',
                    clientSecret: 'shh',
                    codeVerifier: 'verif-1',
                },
            })

            expect(result).toEqual({ accessToken: 'tk_123' })
            const [url, init] = fetchSpy.mock.calls[0]
            expect(url).toBe(TOKEN_URL)
            const initObj = init as RequestInit
            const headers = initObj.headers as Record<string, string>
            expect(headers.Authorization).toBe(
                `Basic ${Buffer.from('twd_abc:shh').toString('base64')}`,
            )
            expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
            const body = new URLSearchParams(initObj.body as string)
            expect(body.get('grant_type')).toBe('authorization_code')
            expect(body.get('code')).toBe('auth-code')
            expect(body.get('redirect_uri')).toBe(REDIRECT_URI)
            expect(body.get('code_verifier')).toBe('verif-1')
        })

        it('throws AUTH_FAILED on non-2xx token response', async () => {
            fetchSpy.mockResolvedValue(new Response('nope', { status: 400 }))
            const provider = createTwistAuthProvider()
            await expect(
                provider.exchangeCode({
                    code: 'c',
                    state: 's',
                    redirectUri: REDIRECT_URI,
                    handshake: { clientId: 'a', clientSecret: 'b', codeVerifier: 'v' },
                }),
            ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
        })

        it('throws when verifier is missing from the handshake', async () => {
            const provider = createTwistAuthProvider()
            await expect(
                provider.exchangeCode({
                    code: 'c',
                    state: 's',
                    redirectUri: REDIRECT_URI,
                    handshake: { clientId: 'a', clientSecret: 'b' },
                }),
            ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
        })
    })

    describe('validateToken', () => {
        it('fetches the session user with the new token and returns a TwistAccount', async () => {
            const getSessionUser = vi.fn().mockResolvedValue({
                id: 42,
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                defaultWorkspace: 7,
            })
            mockCreateClient.mockReturnValue({
                users: { getSessionUser },
            } as unknown as ReturnType<typeof createWrappedTwistClient>)

            const provider = createTwistAuthProvider()
            const account = await provider.validateToken({
                token: 'tk_new',
                handshake: { authMode: 'read-write', authScope: 'user:read threads:read' },
            })

            expect(mockCreateClient).toHaveBeenCalledWith('tk_new')
            expect(account).toEqual({
                id: '42',
                label: 'Ada Lovelace',
                userId: 42,
                email: 'ada@example.com',
                defaultWorkspace: 7,
                authMode: 'read-write',
                authScope: 'user:read threads:read',
            })
        })

        it('falls back to authMode "unknown" when handshake is missing it', async () => {
            mockCreateClient.mockReturnValue({
                users: {
                    getSessionUser: vi.fn().mockResolvedValue({
                        id: 1,
                        name: 'x',
                        email: 'x@x.com',
                    }),
                },
            } as unknown as ReturnType<typeof createWrappedTwistClient>)

            const provider = createTwistAuthProvider()
            const account = await provider.validateToken({ token: 'tk', handshake: {} })
            expect(account.authMode).toBe('unknown')
            expect(account.authScope).toBe('')
        })
    })
})

describe('createTwistTokenStore', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        mockProbeApiToken.mockReset()
        mockSaveApiToken.mockReset()
        mockClearApiToken.mockReset()
    })

    it('active() returns null when no token is stored', async () => {
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const store = createTwistTokenStore()
        expect(await store.active()).toBeNull()
    })

    it('active() returns the probed token + synthesized account', async () => {
        mockProbeApiToken.mockResolvedValue({
            token: 'tk_xyz',
            metadata: { authMode: 'read-only', authScope: 'user:read', source: 'secure-store' },
        })
        const store = createTwistTokenStore()
        const result = await store.active()
        expect(result?.token).toBe('tk_xyz')
        expect(result?.account.authMode).toBe('read-only')
        expect(result?.account.authScope).toBe('user:read')
    })

    it('set() persists token with authMode + authScope and exposes the result', async () => {
        mockSaveApiToken.mockResolvedValue({ storage: 'secure-store' })
        const store = createTwistTokenStore()
        await store.set(
            {
                id: '1',
                label: 'me',
                userId: 1,
                email: 'a@b',
                authMode: 'read-write',
                authScope: 'user:read',
            },
            'tk_new',
        )
        expect(mockSaveApiToken).toHaveBeenCalledWith('tk_new', {
            authMode: 'read-write',
            authScope: 'user:read',
        })
        expect(store.lastSaveResult).toEqual({ storage: 'secure-store' })
    })

    it('clear() delegates to clearApiToken', async () => {
        mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })
        const store = createTwistTokenStore()
        await store.clear()
        expect(mockClearApiToken).toHaveBeenCalledTimes(1)
    })
})
