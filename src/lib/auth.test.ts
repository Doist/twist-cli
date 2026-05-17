import type { TokenStore } from '@doist/cli-core/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from './config.js'

const mocks = vi.hoisted(() => ({
    activeMock: vi.fn(),
    getConfigMock: vi.fn(),
}))

vi.mock('./auth-provider.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./auth-provider.js')>()
    return {
        ...actual,
        createTwistTokenStore: () => ({ active: mocks.activeMock }) as unknown as TokenStore<never>,
    }
})

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        getConfig: mocks.getConfigMock,
    }
})

import { getApiToken, getAuthMetadata, NoTokenError, probeApiToken, TOKEN_ENV_VAR } from './auth.js'

const STORED_ACCOUNT = {
    id: '42',
    label: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

const ADA_USER = {
    id: '42',
    name: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

const BOB_USER = {
    id: '99',
    name: 'Bob',
    authMode: 'read-only' as const,
    authScope: 'user:read',
}

describe('auth shims over the cli-core keyring store', () => {
    beforeEach(() => {
        mocks.activeMock.mockReset()
        mocks.getConfigMock.mockReset().mockResolvedValue({} satisfies Config)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    // `TWIST_API_TOKEN` precedence for `getApiToken` / `probeApiToken` lives
    // inside the wrapped store (`createTwistTokenStore` in `auth-provider.ts`);
    // it's exercised end-to-end there. The shims here just delegate.

    it('getApiToken throws NoTokenError when no stored snapshot is returned', async () => {
        mocks.activeMock.mockResolvedValue(null)

        await expect(getApiToken()).rejects.toBeInstanceOf(NoTokenError)
    })

    it('probeApiToken reports source=secure-store when the active record has no fallbackToken', async () => {
        mocks.activeMock.mockResolvedValue({ token: 'tk_keyring', account: STORED_ACCOUNT })
        mocks.getConfigMock.mockResolvedValue({ users: [ADA_USER] } satisfies Config)

        const { metadata } = await probeApiToken()

        expect(metadata).toEqual({
            authMode: 'read-write',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'secure-store',
        })
    })

    it('probeApiToken reports source=config-file when the active record carries a plaintext token', async () => {
        mocks.activeMock.mockResolvedValue({ token: 'tk_fallback', account: STORED_ACCOUNT })
        mocks.getConfigMock.mockResolvedValue({
            users: [{ ...ADA_USER, token: 'tk_fallback' }],
        } satisfies Config)

        const { metadata } = await probeApiToken()

        expect(metadata.source).toBe('config-file')
    })

    it('getAuthMetadata short-circuits to source=env when TWIST_API_TOKEN is set', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')

        await expect(getAuthMetadata()).resolves.toEqual({ authMode: 'unknown', source: 'env' })

        expect(mocks.getConfigMock).not.toHaveBeenCalled()
    })

    it('getAuthMetadata returns config-sourced identity for the single-user case (no defaultUserId)', async () => {
        mocks.getConfigMock.mockResolvedValue({ users: [ADA_USER] } satisfies Config)

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'read-write',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'config',
        })
    })

    it('getAuthMetadata picks the record matching defaultUserId, not the first one in users[]', async () => {
        // Bob is appended later but pinned as default — Ada (first in the
        // array) must not win, otherwise `tw auth status` would lie about
        // which account is active.
        mocks.getConfigMock.mockResolvedValue({
            users: [ADA_USER, BOB_USER],
            defaultUserId: '99',
        } satisfies Config)

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'read-only',
            authScope: 'user:read',
            authUserId: 99,
            authUserName: 'Bob',
            source: 'config',
        })
    })

    it('getAuthMetadata falls back to the first user when defaultUserId points at no stored record', async () => {
        mocks.getConfigMock.mockResolvedValue({
            users: [ADA_USER, BOB_USER],
            defaultUserId: 'gone',
        } satisfies Config)

        await expect(getAuthMetadata()).resolves.toMatchObject({
            authUserId: 42,
            authUserName: 'Ada',
            source: 'config',
        })
    })

    it('getAuthMetadata reports source=config with unknown mode when no users are stored', async () => {
        mocks.getConfigMock.mockResolvedValue({} satisfies Config)

        await expect(getAuthMetadata()).resolves.toEqual({ authMode: 'unknown', source: 'config' })
    })

    it('getAuthMetadata falls back to v1 flat fields when users[] is empty but legacy state is still on disk (post-upgrade offline window)', async () => {
        // The skipped-migration path leaves config.token + the v1 metadata
        // fields in place. Without this fallback `ensureWriteAllowed` would
        // see `authMode: 'unknown'` and let mutating commands slip past the
        // local READ_ONLY guard until the next CLI invocation completes the
        // migration. Surfaces real `read-only` so the guard fires.
        mocks.getConfigMock.mockResolvedValue({
            token: 'tk_legacy',
            authMode: 'read-only',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
        } satisfies Config)

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'read-only',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'config',
        })
    })

    it('getAuthMetadata legacy fallback handles `tw auth token` users with no authMode on disk (authMode → "unknown")', async () => {
        mocks.getConfigMock.mockResolvedValue({ token: 'tk_token_only' } satisfies Config)

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'unknown',
            source: 'config',
        })
    })
})
