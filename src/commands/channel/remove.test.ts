import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetChannel = vi.fn()

const apiMocks = vi.hoisted(() => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getTwistClient: vi.fn(),
    getSessionUser: vi.fn(),
    getWorkspaceGroups: vi.fn(),
    getOptionalBatchData: vi.fn(),
    addUsersToChannel: vi.fn(),
    removeUsersFromChannel: vi.fn(),
}))

vi.mock('../../lib/api.js', () => apiMocks)

const refsMocks = vi.hoisted(() => ({
    resolveChannelRef: vi.fn(),
    resolveChannelMemberRefs: vi.fn(),
}))

vi.mock('../../lib/refs.js', () => refsMocks)

vi.mock('chalk')

import { registerChannelCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChannelCommand(program)
    return program
}

const sampleChannel = {
    id: 500,
    name: 'general',
    workspaceId: 1,
    userIds: [1, 2, 3],
    creator: 1,
    public: true,
    archived: false,
    created: new Date(),
    version: 1,
    url: 'https://twist.com/a/1/ch/500',
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
    apiMocks.getTwistClient.mockResolvedValue({
        channels: { getChannel: mockGetChannel },
    })
    refsMocks.resolveChannelRef.mockResolvedValue(sampleChannel)
})

describe('tw channel members remove', () => {
    it('only removes users that are members', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 3, 99],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'remove',
            'general',
            'id:2',
            'id:3',
            'id:99',
        ])

        expect(apiMocks.removeUsersFromChannel).toHaveBeenCalledWith(500, [2, 3])
    })

    it('makes no API call when none of the users are members', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [99, 100],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'remove',
            'general',
            'id:99',
            'id:100',
        ])

        expect(apiMocks.removeUsersFromChannel).not.toHaveBeenCalled()
    })

    it('--dry-run does not mutate', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 3],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'remove',
            'general',
            'id:2',
            'id:3',
            '--dry-run',
        ])

        expect(apiMocks.removeUsersFromChannel).not.toHaveBeenCalled()
        expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('[dry-run]'))).toBe(true)
    })

    it('--json shape includes removed/notMembers', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 99],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'remove',
            'general',
            'id:2',
            'id:99',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toMatchObject({ id: 500, removed: [2], notMembers: [99] })
    })

    it('--full fetches and prints the updated channel', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2],
            expandedFrom: [],
        })
        mockGetChannel.mockResolvedValue({ ...sampleChannel, userIds: [1, 3] })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'remove',
            'general',
            'id:2',
            '--json',
            '--full',
        ])

        expect(mockGetChannel).toHaveBeenCalledWith(500)
        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        // --full returns the full SDK channel object
        expect(output.id).toBe(500)
        expect(output).toHaveProperty('creator')
        expect(output).toHaveProperty('version')
    })
})
