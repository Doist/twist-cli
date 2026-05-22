import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    apiMocks.getSessionUser.mockResolvedValue({ id: 1, name: 'Me', email: 'me@d.com' })
    refsMocks.resolveChannelRef.mockResolvedValue(sampleChannel)
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
