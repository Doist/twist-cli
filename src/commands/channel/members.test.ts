import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureConsole } from '../../test-helpers/console.js'
import { createTestProgram } from '../../test-helpers/program.js'

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

const createProgram = () => createTestProgram(registerChannelCommand)

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
    apiMocks.getOptionalBatchData.mockImplementation((response: { code: number; data: unknown }) =>
        response && response.code < 400 ? (response.data ?? null) : null,
    )
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
        const consoleSpy = captureConsole()

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
        const consoleSpy = captureConsole()

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
        captureConsole()

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
        const consoleSpy = captureConsole()

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
        const consoleSpy = captureConsole()

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
