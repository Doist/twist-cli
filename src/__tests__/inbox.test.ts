import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('../lib/global-args.js', async (importOriginal) => ({
    ...(await importOriginal()),
    includePrivateChannels: vi.fn().mockReturnValue(true),
}))

vi.mock('../lib/public-channels.js', () => ({
    getPublicChannelIds: vi.fn(),
}))

vi.mock('chalk')

import { registerInboxCommand } from '../commands/inbox.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerInboxCommand(program)
    return program
}

describe('inbox --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'inbox', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})

describe('inbox --archive-filter', () => {
    const mockGetInbox = vi.fn()
    const mockGetUnread = vi.fn()
    const mockBatch = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        mockGetInbox.mockReturnValue({ data: [] })
        mockGetUnread.mockReturnValue({ data: [] })
        mockBatch.mockResolvedValue([{ data: [] }, { data: [] }])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: mockGetInbox },
            threads: { getUnread: mockGetUnread },
            batch: mockBatch,
        })
    })

    it('passes archiveFilter to SDK getInbox', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--archive-filter', 'all', '--json'])

        expect(mockGetInbox).toHaveBeenCalledWith(
            expect.objectContaining({ archiveFilter: 'all' }),
            { batch: true },
        )
    })

    it('defaults archiveFilter to active when not provided', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--json'])

        expect(mockGetInbox).toHaveBeenCalledWith(
            expect.objectContaining({ archiveFilter: 'active' }),
            { batch: true },
        )
    })
})
