import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({
    getTwistClient: vi.fn(),
}))

import { getTwistClient } from './api.js'
import { includePrivateChannels, resetGlobalArgs } from './global-args.js'
import {
    assertChannelIsPublic,
    clearPublicChannelCache,
    getPublicChannelIds,
} from './public-channels.js'

const mockGetTwistClient = vi.mocked(getTwistClient)

function makeMockPublicChannels(ids: number[]): ReturnType<typeof getTwistClient> {
    return Promise.resolve({
        workspaces: {
            getPublicChannels: vi.fn().mockResolvedValue(ids.map((id) => ({ id }))),
        },
    }) as unknown as ReturnType<typeof getTwistClient>
}

describe('includePrivateChannels', () => {
    const originalArgv = [...process.argv]
    const originalEnv = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS

    beforeEach(() => {
        resetGlobalArgs()
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
        resetGlobalArgs()
    })

    it('returns false by default (private channels hidden)', () => {
        expect(includePrivateChannels()).toBe(false)
    })

    it('returns true when --include-private-channels is in argv', () => {
        process.argv = ['node', 'tw', 'channels', '--include-private-channels']
        resetGlobalArgs()
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

    it('returns the public channel IDs from getPublicChannels', async () => {
        // getPublicChannels is workspace-scoped and returns all public channels (active and
        // archived, joined and unjoined), so every id it returns is part of the allowlist.
        mockGetTwistClient.mockImplementation(() => makeMockPublicChannels([1, 3, 7, 8]))

        const ids = await getPublicChannelIds(100)
        expect(ids).toEqual(new Set([1, 3, 7, 8]))
    })

    it('caches results per workspace', async () => {
        const getPublicChannels = vi.fn().mockResolvedValue([])
        mockGetTwistClient.mockResolvedValue({
            workspaces: { getPublicChannels },
        } as unknown as Awaited<ReturnType<typeof getTwistClient>>)

        await getPublicChannelIds(100)
        await getPublicChannelIds(100)

        expect(getPublicChannels).toHaveBeenCalledTimes(1)
    })

    it('fetches separately for different workspaces', async () => {
        const getPublicChannels = vi.fn().mockResolvedValue([])
        mockGetTwistClient.mockResolvedValue({
            workspaces: { getPublicChannels },
        } as unknown as Awaited<ReturnType<typeof getTwistClient>>)

        await getPublicChannelIds(100)
        await getPublicChannelIds(200)

        expect(getPublicChannels).toHaveBeenCalledTimes(2)
    })
})

describe('assertChannelIsPublic', () => {
    const originalArgv = [...process.argv]
    const originalEnv = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS

    beforeEach(() => {
        clearPublicChannelCache()
        resetGlobalArgs()
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
        resetGlobalArgs()
    })

    it('throws for channels absent from the public list by default', async () => {
        // Channel 6 isn't in getPublicChannels, so it's treated as private.
        mockGetTwistClient.mockImplementation(() => makeMockPublicChannels([5]))

        await expect(assertChannelIsPublic(6, 100)).rejects.toThrow('private channel')
    })

    it('allows public channels by default', async () => {
        mockGetTwistClient.mockImplementation(() => makeMockPublicChannels([5]))

        await expect(assertChannelIsPublic(5, 100)).resolves.toBeUndefined()
    })

    it('allows public channels the user has not joined', async () => {
        // getPublicChannels returns unjoined-but-public channels, so channel 7 is allowed.
        mockGetTwistClient.mockImplementation(() => makeMockPublicChannels([7]))

        await expect(assertChannelIsPublic(7, 100)).resolves.toBeUndefined()
    })

    it('allows private channels when --include-private-channels is set', async () => {
        process.argv = ['node', 'tw', '--include-private-channels']
        resetGlobalArgs()
        await expect(assertChannelIsPublic(999, 100)).resolves.toBeUndefined()
    })

    it('allows private channels when env var is set', async () => {
        process.env.TWIST_INCLUDE_PRIVATE_CHANNELS = '1'
        await expect(assertChannelIsPublic(999, 100)).resolves.toBeUndefined()
    })
})
