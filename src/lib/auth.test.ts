import type { TokenStore, UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    activeMock: vi.fn(),
    listMock: vi.fn(),
}))

vi.mock('./auth-provider.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./auth-provider.js')>()
    return {
        ...actual,
        createTwistTokenStore: () => ({ active: mocks.activeMock }) as unknown as TokenStore<never>,
    }
})

vi.mock('./user-records.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./user-records.js')>()
    return {
        ...actual,
        createTwistUserRecordStore: () =>
            ({ list: mocks.listMock }) as unknown as UserRecordStore<never>,
    }
})

import { getApiToken, getAuthMetadata, NoTokenError, probeApiToken, TOKEN_ENV_VAR } from './auth.js'

const STORED_ACCOUNT = {
    id: '42',
    label: 'Ada',
    authMode: 'read-write' as const,
    authScope: 'user:read',
}

const STORED_RECORD: UserRecord<typeof STORED_ACCOUNT> = { account: STORED_ACCOUNT }

describe('auth shims over the cli-core keyring store', () => {
    beforeEach(() => {
        mocks.activeMock.mockReset()
        mocks.listMock.mockReset()
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

    it('probeApiToken reports source=secure-store when the record has no fallbackToken', async () => {
        mocks.activeMock.mockResolvedValue({ token: 'tk_keyring', account: STORED_ACCOUNT })
        mocks.listMock.mockResolvedValue([STORED_RECORD])

        const { metadata } = await probeApiToken()

        expect(metadata).toEqual({
            authMode: 'read-write',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'secure-store',
        })
    })

    it('probeApiToken reports source=config-file when the record carries a fallbackToken', async () => {
        mocks.activeMock.mockResolvedValue({ token: 'tk_fallback', account: STORED_ACCOUNT })
        mocks.listMock.mockResolvedValue([{ ...STORED_RECORD, fallbackToken: 'tk_fallback' }])

        const { metadata } = await probeApiToken()

        expect(metadata.source).toBe('config-file')
    })

    it('getAuthMetadata short-circuits to source=env when TWIST_API_TOKEN is set', async () => {
        vi.stubEnv(TOKEN_ENV_VAR, 'env_token_value')

        await expect(getAuthMetadata()).resolves.toEqual({ authMode: 'unknown', source: 'env' })

        expect(mocks.listMock).not.toHaveBeenCalled()
    })

    it('getAuthMetadata returns config-sourced identity when no env var is set', async () => {
        mocks.listMock.mockResolvedValue([STORED_RECORD])

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'read-write',
            authScope: 'user:read',
            authUserId: 42,
            authUserName: 'Ada',
            source: 'config',
        })
    })
})
