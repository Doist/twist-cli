import { describeEmptyMachineOutput } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
    assertBatchData: <T>(response: { code?: number; data: T }, label: string): T => {
        if ((response.code ?? 200) >= 400 || response.data == null) {
            throw new Error(`Failed to fetch ${label}.`)
        }
        return response.data
    },
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

import { registerInboxCommand } from './inbox.js'

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

const emptyInboxMockBatch = vi.fn()

describeEmptyMachineOutput('inbox empty output', {
    setup: () => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        emptyInboxMockBatch.mockImplementation((..._calls: unknown[]) =>
            Promise.resolve([{ data: [] }, { data: [] }]),
        )
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: vi.fn().mockReturnValue({ data: [] }) },
            threads: { getUnread: vi.fn().mockReturnValue({ data: [] }) },
            channels: { getChannel: vi.fn() },
            batch: emptyInboxMockBatch,
        })
    },
    run: async (extraArgs) => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', ...extraArgs])
    },
    humanMessage: 'No threads in inbox.',
})

describe('inbox empty output (channel filter)', () => {
    const mockBatch = vi.fn()
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        const thread = {
            id: 1,
            channelId: 10,
            title: 't',
            posted: '2026-05-01T00:00:00Z',
            url: 'http://example/t',
        }
        mockBatch
            .mockResolvedValueOnce([{ data: [thread] }, { data: [] }])
            .mockResolvedValueOnce([{ data: { id: 10, name: 'engineering' } }])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: vi.fn() },
            threads: { getUnread: vi.fn() },
            channels: { getChannel: vi.fn() },
            batch: mockBatch,
        })
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('outputs [] for --json when --channel filter matches nothing', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--channel', 'nonexistent', '--json'])

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledWith('[]')
    })
})
