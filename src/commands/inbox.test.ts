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

describe('inbox empty output', () => {
    const mockGetInbox = vi.fn()
    const mockGetUnread = vi.fn()
    const mockGetChannel = vi.fn()
    const mockBatch = vi.fn()
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        mockGetInbox.mockReturnValue({ data: [] })
        mockGetUnread.mockReturnValue({ data: [] })
        mockBatch.mockImplementation((..._calls: unknown[]) =>
            Promise.resolve([{ data: [] }, { data: [] }]),
        )
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: mockGetInbox },
            threads: { getUnread: mockGetUnread },
            channels: { getChannel: mockGetChannel },
            batch: mockBatch,
        })
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('outputs [] for --json when inbox is empty', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--json'])

        const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(output.trim()).toBe('[]')
        expect(output).not.toContain('No threads')
    })

    it('outputs nothing for --ndjson when inbox is empty', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--ndjson'])

        // Must not call console.log at all — `console.log('')` still emits a
        // stray newline and would break strict NDJSON consumers.
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('still prints human message when --json/--ndjson not set', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox'])

        const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(output).toContain('No threads in inbox.')
    })

    it('outputs [] for --json when --channel filter matches nothing', async () => {
        const thread = {
            id: 1,
            channelId: 10,
            title: 't',
            posted: '2026-05-01T00:00:00Z',
            url: 'http://example/t',
        }
        mockBatch.mockReset()
        mockBatch
            .mockResolvedValueOnce([{ data: [thread] }, { data: [] }])
            .mockResolvedValueOnce([{ data: { id: 10, name: 'engineering' } }])

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--channel', 'nonexistent', '--json'])

        const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(output.trim()).toBe('[]')
    })
})
