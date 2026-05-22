import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockBatch = vi.fn()
const mockGetUserById = vi.fn()
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

const frontendGroup = { id: 100, name: 'Frontend', workspaceId: 1, userIds: [1, 2], version: 1 }
const backendGroup = { id: 200, name: 'Backend', workspaceId: 1, userIds: [4, 5], version: 1 }
// Group whose membership is a subset of channel's userIds [1,2,3]
const allInChannel = { id: 300, name: 'Core', workspaceId: 1, userIds: [1, 2], version: 1 }

beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
    // Return a tagged sentinel per user id so we can assert that batch() received the
    // exact requests built by the SDK call.
    mockGetUserById.mockImplementation((args: { userId: number }) => ({
        __req: 'getUserById',
        userId: args.userId,
    }))
    apiMocks.getTwistClient.mockResolvedValue({
        workspaceUsers: { getUserById: mockGetUserById },
        channels: { getChannel: mockGetChannel },
        batch: mockBatch,
    })
    // The default real-world behaviour: pass through response.data, ignoring the label.
    apiMocks.getOptionalBatchData.mockImplementation((response: { code: number; data: unknown }) =>
        response && response.code < 400 ? (response.data ?? null) : null,
    )
    apiMocks.getSessionUser.mockResolvedValue({ id: 1, name: 'Me', email: 'me@d.com' })
    apiMocks.getWorkspaceGroups.mockResolvedValue([frontendGroup, backendGroup, allInChannel])
    refsMocks.resolveChannelRef.mockResolvedValue(sampleChannel)
})

describe('tw channel members (list)', () => {
    beforeEach(() => {
        mockBatch.mockResolvedValue([
            { code: 200, data: { id: 1, name: 'Alice', email: 'a@d.com' } },
            { code: 200, data: { id: 2, name: 'Bob', email: 'b@d.com' } },
            { code: 200, data: { id: 3, name: 'Carol', email: 'c@d.com' } },
        ])
    })

    it('lists users and groups fully in channel', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'members', 'general'])

        const text = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(text).toContain('Alice')
        expect(text).toContain('Bob')
        expect(text).toContain('Carol')
        // "Core" group's userIds [1,2] are all in channel userIds [1,2,3]
        expect(text).toContain('Core')
        expect(text).toContain('Frontend')
        // Backend's [4,5] are not in channel → should not appear in groups section
        expect(text).not.toMatch(/Backend\s+\(/)
    })

    it('outputs JSON with default shape', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'members', 'general', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.id).toBe(500)
        expect(output.members).toHaveLength(3)
        expect(output.members[0]).toMatchObject({ id: 1, name: 'Alice' })
        expect(output.groupsFullyInChannel.map((g: { id: number }) => g.id).sort()).toEqual([
            100, 300,
        ])
    })

    it('batches one getUserById request per channel member', async () => {
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'members', 'general', '--json'])

        // Verify the batch wiring: getUserById is built for each userId, then those
        // requests are passed verbatim into batch().
        expect(mockGetUserById).toHaveBeenCalledTimes(3)
        expect(mockGetUserById).toHaveBeenNthCalledWith(
            1,
            { workspaceId: 1, userId: 1 },
            { batch: true },
        )
        expect(mockBatch).toHaveBeenCalledWith(
            { __req: 'getUserById', userId: 1 },
            { __req: 'getUserById', userId: 2 },
            { __req: 'getUserById', userId: 3 },
        )
    })

    it('ndjson default shape matches json default shape', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'members', 'general', '--ndjson'])

        const line = consoleSpy.mock.calls[0][0].split('\n').filter(Boolean)[0]
        const output = JSON.parse(line)
        expect(output.id).toBe(500)
        expect(output.members).toHaveLength(3)
        // Slim shape — no raw SDK fields like `creator`, `version` unless --full was passed.
        expect(output).not.toHaveProperty('creator')
        expect(output).not.toHaveProperty('version')
    })

    it('--full ndjson includes raw channel fields', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'general',
            '--ndjson',
            '--full',
        ])

        const line = consoleSpy.mock.calls[0][0].split('\n').filter(Boolean)[0]
        const output = JSON.parse(line)
        expect(output).toHaveProperty('creator')
        expect(output).toHaveProperty('version')
    })
})

describe('tw channel add', () => {
    it('adds users (no group expansion)', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'add',
            'general',
            'dave@d.com',
            'eve@d.com',
        ])

        expect(refsMocks.resolveChannelMemberRefs).toHaveBeenCalledWith(
            ['dave@d.com', 'eve@d.com'],
            1,
        )
        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4, 5])
    })

    it('expands group:<ref> and dedupes', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [4, 5, 6],
            expandedFrom: [{ groupId: 200, groupName: 'Backend', userIds: [4, 5] }],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'add',
            'general',
            'group:Backend',
            'frank',
        ])

        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4, 5, 6])
        const text = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(text).toContain('Backend')
    })

    it('skips users already in channel', async () => {
        // channel has [1,2,3]; requesting [2,4] → only 4 should be added, 2 skipped
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 4],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'add', 'general', 'id:2', 'id:4'])

        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4])
    })

    it('makes no API call when all users already members', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [1, 2],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'add', 'general', 'id:1', 'id:2'])

        expect(apiMocks.addUsersToChannel).not.toHaveBeenCalled()
    })

    it('--dry-run does not mutate', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'add',
            'general',
            'id:4',
            'id:5',
            '--dry-run',
        ])

        expect(apiMocks.addUsersToChannel).not.toHaveBeenCalled()
        expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('[dry-run]'))).toBe(true)
    })

    it('--json shape includes added/alreadyMembers', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 4],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'add',
            'general',
            'id:2',
            'id:4',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toMatchObject({ id: 500, added: [4], alreadyMembers: [2] })
    })
})

describe('tw channel remove', () => {
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

        await program.parseAsync(['node', 'tw', 'channel', 'remove', 'general', 'id:99', 'id:100'])

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

describe('tw channel sync', () => {
    it('dry-run by default — does not mutate', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [1, 4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'sync',
            'general',
            'id:1',
            'id:4',
            'id:5',
        ])

        expect(apiMocks.addUsersToChannel).not.toHaveBeenCalled()
        expect(apiMocks.removeUsersFromChannel).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(text).toContain('[dry-run]')
    })

    it('--apply computes add/remove diff', async () => {
        // channel currently [1,2,3]; desired [1,4,5] → add [4,5], remove [2,3]
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [1, 4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'sync',
            'general',
            'id:1',
            'id:4',
            'id:5',
            '--apply',
        ])

        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4, 5])
        expect(apiMocks.removeUsersFromChannel).toHaveBeenCalledWith(500, [2, 3])
    })

    it('refuses to remove acting user without --include-self', async () => {
        // session user id:1 is in current channel; desired set omits id:1 → would remove self
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 3, 4],
            expandedFrom: [],
        })
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'channel',
                'sync',
                'general',
                'id:2',
                'id:3',
                'id:4',
                '--apply',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_VALUE' })
    })

    it('--include-self allows removing acting user', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [2, 3, 4],
            expandedFrom: [],
        })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'sync',
            'general',
            'id:2',
            'id:3',
            'id:4',
            '--apply',
            '--include-self',
        ])

        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4])
        expect(apiMocks.removeUsersFromChannel).toHaveBeenCalledWith(500, [1])
    })

    it('--json output shape', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [1, 4],
            expandedFrom: [{ groupId: 200, groupName: 'Backend', userIds: [4] }],
        })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'sync',
            'general',
            'id:1',
            'group:Backend',
            '--apply',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toMatchObject({
            id: 500,
            added: [4],
            removed: [2, 3],
            expandedFrom: [{ groupId: 200, groupName: 'Backend', userIds: [4] }],
        })
    })
})
