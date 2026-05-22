import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChannelFixture } from '../../lib/__fixtures__/channels.js'
import { captureConsole } from '../../test-helpers/console.js'
import { createTestProgram } from '../../test-helpers/program.js'

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

const sampleChannel = createChannelFixture()

beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
    apiMocks.getTwistClient.mockResolvedValue({
        channels: { getChannel: mockGetChannel },
    })
    refsMocks.resolveChannelRef.mockResolvedValue(sampleChannel)
})

describe('tw channel members add', () => {
    it('adds users (no group expansion)', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
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
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
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
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'add',
            'general',
            'id:2',
            'id:4',
        ])

        expect(apiMocks.addUsersToChannel).toHaveBeenCalledWith(500, [4])
    })

    it('makes no API call when all users already members', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [1, 2],
            expandedFrom: [],
        })
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
            'add',
            'general',
            'id:1',
            'id:2',
        ])

        expect(apiMocks.addUsersToChannel).not.toHaveBeenCalled()
    })

    it('--dry-run does not mutate', async () => {
        refsMocks.resolveChannelMemberRefs.mockResolvedValue({
            userIds: [4, 5],
            expandedFrom: [],
        })
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
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
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'members',
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
