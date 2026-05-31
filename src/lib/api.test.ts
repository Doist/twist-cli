import { TwistRequestError } from '@doist/twist-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mocks — shared across both describe blocks.
const getWorkspaceUsersMock = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const sdkMocks = vi.hoisted(() => ({
    deleteChannel: vi.fn(),
    uploadAttachment: vi.fn(),
}))

vi.mock('@doist/twist-sdk', () => {
    class TwistApi {
        channels = { deleteChannel: sdkMocks.deleteChannel }
        attachments = { upload: sdkMocks.uploadAttachment }
        workspaceUsers = { getWorkspaceUsers: getWorkspaceUsersMock }
        constructor(_token?: string) {}
    }
    return {
        TwistApi,
        TwistRequestError: class TwistRequestError extends Error {
            constructor(
                message: string,
                public httpStatusCode: number,
                public responseData?: unknown,
            ) {
                super(message)
            }
        },
    }
})

vi.mock('./auth.js', () => ({
    getApiToken: vi.fn().mockResolvedValue('test-token'),
    getAuthMetadata: vi.fn().mockResolvedValue({ authMode: 'full' }),
}))

vi.mock('./permissions.js', () => ({
    ensureWriteAllowed: vi.fn(),
    isMutatingMethod: vi.fn().mockReturnValue(false),
}))

vi.mock('./spinner.js', () => ({
    withSpinner: <T>(_label: unknown, fn: () => Promise<T>) => fn(),
}))

vi.mock('./progress.js', () => ({
    getProgressTracker: () => ({ isEnabled: () => false, emitApiCall: vi.fn() }),
}))

import { getWorkspaceUsers } from './api.js'

// ─── getWorkspaceUsers ────────────────────────────────────────────────────────
// The SDK (≥2.8.1) filters removed users itself; the contract this test guards
// is "we pass `includeRemoved` through unchanged."

describe('getWorkspaceUsers', () => {
    beforeEach(() => {
        getWorkspaceUsersMock.mockClear()
    })

    it('passes includeRemoved: undefined by default so the SDK applies its default filter', async () => {
        await getWorkspaceUsers(1585)
        expect(getWorkspaceUsersMock).toHaveBeenCalledWith({
            workspaceId: 1585,
            includeRemoved: undefined,
        })
    })

    it('forwards includeRemoved: true to the SDK', async () => {
        await getWorkspaceUsers(1585, { includeRemoved: true })
        expect(getWorkspaceUsersMock).toHaveBeenCalledWith({
            workspaceId: 1585,
            includeRemoved: true,
        })
    })
})

// ─── wrapResult — central 403 translation ────────────────────────────────────

describe('wrapResult — central 403 translation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
    })

    it('translates a plain 403 into a FORBIDDEN CliError', async () => {
        sdkMocks.deleteChannel.mockRejectedValueOnce(
            new TwistRequestError('Request failed with status 403', 403, {}),
        )

        const { createWrappedTwistClient } = await import('./api.js')
        const client = createWrappedTwistClient('test-token')

        await expect(client.channels.deleteChannel(500)).rejects.toMatchObject({
            code: 'FORBIDDEN',
            message: 'Twist refused this action: 403 Forbidden.',
            hints: [
                'You may not have permission for this action',
                'Contact your workspace admin, or re-authenticate with `tw auth login` if your token looks wrong',
            ],
        })
    })

    it('prefers INSUFFICIENT_SCOPE over FORBIDDEN when error_string indicates scope', async () => {
        sdkMocks.deleteChannel.mockRejectedValueOnce(
            new TwistRequestError('Request failed with status 403', 403, {
                error_string: 'Insufficient scope provided: channels:write',
            }),
        )

        const { createWrappedTwistClient } = await import('./api.js')
        const client = createWrappedTwistClient('test-token')

        await expect(client.channels.deleteChannel(500)).rejects.toMatchObject({
            code: 'INSUFFICIENT_SCOPE',
            message: 'This action requires permissions your current token does not have.',
            hints: ['Run `tw auth login` to re-authenticate with the required scopes'],
        })
    })

    it('translates an attachments.upload scope 403 into INSUFFICIENT_SCOPE (re-login prompt)', async () => {
        sdkMocks.uploadAttachment.mockRejectedValueOnce(
            new TwistRequestError('Request failed with status 403', 403, {
                error_string: 'Insufficient scope provided: attachments:write',
            }),
        )

        const { createWrappedTwistClient } = await import('./api.js')
        const client = createWrappedTwistClient('test-token')

        await expect(
            client.attachments.upload({ file: new Blob(['x']), fileName: 'x.png' }),
        ).rejects.toMatchObject({
            code: 'INSUFFICIENT_SCOPE',
            message: 'This action requires permissions your current token does not have.',
            hints: ['Run `tw auth login` to re-authenticate with the required scopes'],
        })
    })

    it('passes non-403 errors through untranslated', async () => {
        const originalError = new TwistRequestError('Request failed with status 500', 500, {})
        sdkMocks.deleteChannel.mockRejectedValueOnce(originalError)

        const { createWrappedTwistClient } = await import('./api.js')
        const client = createWrappedTwistClient('test-token')

        await expect(client.channels.deleteChannel(500)).rejects.toBe(originalError)
    })
})
