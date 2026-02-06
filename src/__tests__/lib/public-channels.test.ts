import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api.js', () => ({
    getTwistClient: vi.fn(),
}))

import { getTwistClient } from '../../lib/api.js'
import {
    assertChannelIsPublic,
    clearPublicChannelCache,
    getPublicChannelIds,
    includePrivateChannels,
} from '../../lib/public-channels.js'

const mockGetTwistClient = vi.mocked(getTwistClient)

function makeMockChannels(
    channels: Array<{ id: number; public: boolean }>,
): ReturnType<typeof getTwistClient> {
    return Promise.resolve({
        channels: {
            getChannels: vi.fn().mockResolvedValue(channels),
        },
    }) as unknown as ReturnType<typeof getTwistClient>
}

describe('includePrivateChannels', () => {
    const originalArgv = process.argv
    const originalEnv = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS

    beforeEach(() => {
        process.argv = ['node', 'tw']
        delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    })

    afterEach(() => {
        process.argv = originalArgv
        if (originalEnv !== undefined) {
            process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = originalEnv
        } else {
            delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
        }
    })

    it('returns false by default (private channels hidden)', () => {
        expect(includePrivateChannels()).toBe(false)
    })

    it('returns true when --include-private-channels is in argv', () => {
        process.argv = ['node', 'tw', 'channels', '--include-private-channels']
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns true when TWIST_INCLUDE_PRIVATE_CHANNELS=1', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '1'
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns true when TWIST_INCLUDE_PRIVATE_CHANNELS=true', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = 'true'
        expect(includePrivateChannels()).toBe(true)
    })

    it('returns false for other env values', () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '0'
        expect(includePrivateChannels()).toBe(false)

        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = 'false'
        expect(includePrivateChannels()).toBe(false)

        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = ''
        expect(includePrivateChannels()).toBe(false)
    })
})

describe('getPublicChannelIds', () => {
    beforeEach(() => {
        clearPublicChannelCache()
    })

    it('returns only public channel IDs', async () => {
        mockGetTwistClient.mockImplementation(() =>
            makeMockChannels([
                { id: 1, public: true },
                { id: 2, public: false },
                { id: 3, public: true },
            ]),
        )

        const ids = await getPublicChannelIds(100)
        expect(ids).toEqual(new Set([1, 3]))
    })

    it('caches results per workspace', async () => {
        const getChannels = vi.fn().mockResolvedValue([{ id: 1, public: true }])
        mockGetTwistClient.mockResolvedValue({
            channels: { getChannels },
        } as unknown as Awaited<ReturnType<typeof getTwistClient>>)

        await getPublicChannelIds(100)
        await getPublicChannelIds(100)

        expect(getChannels).toHaveBeenCalledTimes(1)
    })

    it('fetches separately for different workspaces', async () => {
        const getChannels = vi.fn().mockResolvedValue([{ id: 1, public: true }])
        mockGetTwistClient.mockResolvedValue({
            channels: { getChannels },
        } as unknown as Awaited<ReturnType<typeof getTwistClient>>)

        await getPublicChannelIds(100)
        await getPublicChannelIds(200)

        expect(getChannels).toHaveBeenCalledTimes(2)
    })
})

describe('assertChannelIsPublic', () => {
    const originalArgv = process.argv
    const originalEnv = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS

    beforeEach(() => {
        clearPublicChannelCache()
        process.argv = ['node', 'tw']
        delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    })

    afterEach(() => {
        process.argv = originalArgv
        if (originalEnv !== undefined) {
            process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = originalEnv
        } else {
            delete process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
        }
    })

    it('throws for private channels by default', async () => {
        mockGetTwistClient.mockImplementation(() =>
            makeMockChannels([
                { id: 5, public: true },
                { id: 6, public: false },
            ]),
        )

        await expect(assertChannelIsPublic(6, 100)).rejects.toThrow('private channel')
    })

    it('allows public channels by default', async () => {
        mockGetTwistClient.mockImplementation(() => makeMockChannels([{ id: 5, public: true }]))

        await expect(assertChannelIsPublic(5, 100)).resolves.toBeUndefined()
    })

    it('allows private channels when --include-private-channels is set', async () => {
        process.argv = ['node', 'tw', '--include-private-channels']
        await expect(assertChannelIsPublic(999, 100)).resolves.toBeUndefined()
    })

    it('allows private channels when env var is set', async () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '1'
        await expect(assertChannelIsPublic(999, 100)).resolves.toBeUndefined()
    })
})
