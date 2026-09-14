import {
    captureConsole,
    createTestProgram,
    describeEmptyMachineOutput,
} from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn(),
}))

vi.mock('../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/api.js')>()),
    ...apiMocks,
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('../lib/global-args.js', async (importOriginal) => ({
    ...(await importOriginal()),
    includePrivateChannels: vi.fn().mockReturnValue(true),
    isAccessible: vi.fn().mockReturnValue(false),
}))

vi.mock('../lib/public-channels.js', () => ({
    getPublicChannelIds: vi.fn(),
}))

vi.mock('chalk')

import { registerInboxCommand } from './inbox.js'

const createProgram = () => createTestProgram(registerInboxCommand)

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
        mockBatch.mockResolvedValue([
            { code: 200, data: [] },
            { code: 200, data: [] },
        ])
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

    it('maps --since to newerThan and --until to olderThan for getInbox', async () => {
        const program = createProgram()
        await program.parseAsync([
            'node',
            'tw',
            'inbox',
            '--since',
            '2026-01-01',
            '--until',
            '2026-02-01',
            '--json',
        ])

        expect(mockGetInbox).toHaveBeenCalledWith(
            expect.objectContaining({
                newerThan: new Date('2026-01-01'),
                olderThan: new Date('2026-02-01'),
            }),
            { batch: true },
        )
        const [args] = mockGetInbox.mock.calls[0] as [Record<string, unknown>]
        expect(args).not.toHaveProperty('since')
        expect(args).not.toHaveProperty('until')
    })
})

const emptyInboxMockBatch = vi.fn()

describeEmptyMachineOutput('inbox empty output', {
    setup: () => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        emptyInboxMockBatch.mockImplementation((..._calls: unknown[]) =>
            Promise.resolve([
                { code: 200, data: [] },
                { code: 200, data: [] },
            ]),
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
            .mockResolvedValueOnce([
                { code: 200, data: [thread] },
                { code: 200, data: [] },
            ])
            .mockResolvedValueOnce([{ code: 200, data: { id: 10, name: 'engineering' } }])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: vi.fn() },
            threads: { getUnread: vi.fn() },
            channels: { getChannel: vi.fn() },
            batch: mockBatch,
        })
        logSpy = captureConsole()
    })

    it('outputs [] for --json when --channel filter matches nothing', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--channel', 'nonexistent', '--json'])

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledWith('[]')
    })
})

describe('inbox batch errors', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
    })

    it('surfaces the API error instead of crashing when a batch request fails', async () => {
        const mockBatch = vi.fn().mockResolvedValue([
            { code: 400, data: { errorString: 'limit must be less than or equal to 500' } },
            { code: 200, data: [] },
        ])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: {
                getInbox: vi.fn((_args: unknown, options?: { batch?: boolean }) =>
                    options?.batch ? { kind: 'inbox' } : Promise.resolve([]),
                ),
            },
            threads: {
                getUnread: vi.fn((_workspaceId: number, options?: { batch?: boolean }) =>
                    options?.batch ? { kind: 'unread' } : Promise.resolve([]),
                ),
            },
            batch: mockBatch,
        })

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'inbox', '--unread', '--limit', '1000']),
        ).rejects.toThrow('Failed to fetch inbox threads: limit must be less than or equal to 500')
    })

    it('treats a null unread batch response as no unread threads', async () => {
        const thread = {
            id: 1,
            channelId: 10,
            title: 't',
            posted: '2026-05-01T00:00:00Z',
            url: 'http://example/t',
        }
        const mockBatch = vi
            .fn()
            .mockResolvedValueOnce([
                { code: 200, data: [thread] },
                { code: 200, data: null },
            ])
            .mockResolvedValueOnce([{ code: 200, data: { id: 10, name: 'engineering' } }])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: {
                getInbox: vi.fn((_args: unknown, options?: { batch?: boolean }) =>
                    options?.batch ? { kind: 'inbox' } : Promise.resolve([]),
                ),
            },
            threads: {
                getUnread: vi.fn((_workspaceId: number, options?: { batch?: boolean }) =>
                    options?.batch ? { kind: 'unread' } : Promise.resolve([]),
                ),
            },
            channels: { getChannel: vi.fn() },
            batch: mockBatch,
        })
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'inbox', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toHaveLength(1)
        expect(output[0]).toMatchObject({ id: 1, isUnread: false })
    })
})

describe('inbox unread mentions', () => {
    let logSpy: ReturnType<typeof vi.spyOn>

    const mentioned = {
        id: 1,
        channelId: 10,
        title: 'mentioned',
        posted: '2026-05-01T00:00:00Z',
        url: 'http://example/1',
    }
    const unread = {
        id: 2,
        channelId: 10,
        title: 'unread',
        posted: '2026-05-03T00:00:00Z',
        url: 'http://example/2',
    }
    const read = {
        id: 3,
        channelId: 10,
        title: 'read',
        posted: '2026-05-02T00:00:00Z',
        url: 'http://example/3',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        const mockBatch = vi
            .fn()
            .mockResolvedValueOnce([
                { code: 200, data: [unread, read, mentioned] },
                {
                    code: 200,
                    data: [
                        { threadId: 1, channelId: 10, objIndex: 3, directMention: true },
                        { threadId: 2, channelId: 10, objIndex: 1, directMention: false },
                    ],
                },
            ])
            .mockResolvedValueOnce([{ code: 200, data: { id: 10, name: 'engineering' } }])
        apiMocks.getTwistClient.mockResolvedValue({
            inbox: { getInbox: vi.fn() },
            threads: { getUnread: vi.fn() },
            channels: { getChannel: vi.fn() },
            batch: mockBatch,
        })
        logSpy = captureConsole()
    })

    it('sets hasUnreadMention only for unread threads with a direct mention', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--json'])

        const output = JSON.parse(logSpy.mock.calls[0][0])
        const byId = Object.fromEntries(output.map((t: { id: number }) => [t.id, t]))
        expect(byId[1]).toMatchObject({ isUnread: true, hasUnreadMention: true })
        expect(byId[2]).toMatchObject({ isUnread: true, hasUnreadMention: false })
        expect(byId[3]).toMatchObject({ isUnread: false, hasUnreadMention: false })
    })

    it('sorts mention threads before other unread threads within a channel', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--json'])

        const output = JSON.parse(logSpy.mock.calls[0][0])
        // "unread" is newer than "mentioned", so date order alone would put it first
        expect(output.map((t: { id: number }) => t.id)).toEqual([1, 2, 3])
    })

    it('--mentions filters to unread threads with a direct mention', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--mentions', '--json'])

        const output = JSON.parse(logSpy.mock.calls[0][0])
        expect(output).toHaveLength(1)
        expect(output[0]).toMatchObject({ id: 1, hasUnreadMention: true })
    })

    it('includes hasUnreadMention in --full output', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox', '--json', '--full'])

        const output = JSON.parse(logSpy.mock.calls[0][0])
        expect(output[0]).toHaveProperty('hasUnreadMention', true)
    })

    it('marks mention rows with @ next to the unread badge in human output', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'inbox'])

        const lines = logSpy.mock.calls.map((call: unknown[]) => String(call[0]))
        expect(lines).toContain('  mentioned * @')
        expect(lines).toContain('  unread *')
        expect(lines).toContain('  read')
    })
})
