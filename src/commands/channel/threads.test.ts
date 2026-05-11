import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn(),
}))

const refsMocks = vi.hoisted(() => ({
    resolveWorkspaceRef: vi.fn(),
    resolveChannelRef: vi.fn(),
}))

vi.mock('../../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
    assertBatchData: <T>(response: { code?: number; data: T }, label: string): T => {
        if ((response.code ?? 200) >= 400 || response.data == null) {
            throw new Error(`Failed to fetch ${label}.`)
        }
        return response.data
    },
}))

vi.mock('../../lib/refs.js', () => ({
    resolveWorkspaceRef: refsMocks.resolveWorkspaceRef,
    resolveChannelRef: refsMocks.resolveChannelRef,
}))

vi.mock('../../lib/global-args.js', async (importOriginal) => ({
    ...(await importOriginal()),
    includePrivateChannels: vi.fn().mockReturnValue(true),
    isAccessible: vi.fn().mockReturnValue(false),
}))

vi.mock('../../lib/public-channels.js', () => ({
    assertChannelIsPublic: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('chalk')

import { CliError } from '../../lib/errors.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { decodeCursor, encodeCursor } from './helpers.js'
import { registerChannelCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChannelCommand(program)
    return program
}

type Thread = {
    id: number
    title: string
    channelId: number
    workspaceId: number
    creator: number
    commentCount: number
    lastUpdated: Date
    posted: Date
    isArchived: boolean
    url: string
    pinned?: boolean
    snippet?: string
    snippetCreator?: number
    starred?: boolean
    content?: string
}

function createThread(id: number, overrides: Partial<Thread> = {}): Thread {
    return {
        id,
        title: `Thread ${id}`,
        channelId: 100,
        workspaceId: 1,
        creator: 999,
        commentCount: 0,
        lastUpdated: new Date(`2026-01-${String(id).padStart(2, '0')}T00:00:00Z`),
        posted: new Date(`2026-01-${String(id).padStart(2, '0')}T00:00:00Z`),
        isArchived: false,
        url: `https://twist.com/a/1/ch/100/t/${id}`,
        pinned: false,
        snippet: '',
        snippetCreator: 999,
        starred: false,
        content: '',
        ...overrides,
    }
}

function setupClient({
    threads = [],
    unread = [],
}: {
    threads?: Thread[]
    unread?: { threadId: number }[]
} = {}) {
    const mockGetThreads = vi.fn().mockReturnValue('threads-descriptor')
    const mockGetUnread = vi.fn().mockReturnValue('unread-descriptor')
    const mockBatch = vi.fn().mockResolvedValue([{ data: threads }, { data: unread }])

    apiMocks.getTwistClient.mockResolvedValue({
        threads: { getThreads: mockGetThreads, getUnread: mockGetUnread },
        batch: mockBatch,
    })

    return { mockGetThreads, mockGetUnread, mockBatch }
}

function channel(id = 100, name = 'general') {
    return { id, name, workspaceId: 1, archived: false, public: true }
}

describe('channel threads', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        refsMocks.resolveChannelRef.mockResolvedValue(channel())
    })

    it('errors when both positional workspace and --workspace are provided', async () => {
        setupClient()
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'channel',
                'threads',
                'general',
                'Doist',
                '--workspace',
                'Other',
            ]),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })

    it('resolves channel via resolveChannelRef', async () => {
        setupClient()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', 'general', '--json'])

        expect(refsMocks.resolveChannelRef).toHaveBeenCalledWith('general', 1)
    })

    it('uses workspace from positional arg when provided', async () => {
        refsMocks.resolveWorkspaceRef.mockResolvedValue({ id: 42, name: 'Doist' })
        setupClient()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', 'general', 'Doist', '--json'])

        expect(refsMocks.resolveWorkspaceRef).toHaveBeenCalledWith('Doist')
        expect(refsMocks.resolveChannelRef).toHaveBeenCalledWith('general', 42)
    })

    it('passes archived:false to getThreads by default', async () => {
        const { mockGetThreads } = setupClient()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        expect(mockGetThreads).toHaveBeenCalledWith(
            { workspaceId: 1, channelId: 100, archived: false },
            { batch: true },
        )
    })

    it('--archive-filter all omits archived', async () => {
        const { mockGetThreads } = setupClient()
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--archive-filter',
            'all',
            '--json',
        ])

        expect(mockGetThreads).toHaveBeenCalledWith(
            { workspaceId: 1, channelId: 100 },
            { batch: true },
        )
    })

    it('--archive-filter archived passes archived:true', async () => {
        const { mockGetThreads } = setupClient()
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--archive-filter',
            'archived',
            '--json',
        ])

        expect(mockGetThreads).toHaveBeenCalledWith(
            { workspaceId: 1, channelId: 100, archived: true },
            { batch: true },
        )
    })

    it('merges isUnread from getUnread set', async () => {
        setupClient({
            threads: [createThread(1), createThread(2), createThread(3)],
            unread: [{ threadId: 2 }],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.find((t: { id: number }) => t.id === 1).isUnread).toBe(false)
        expect(output.results.find((t: { id: number }) => t.id === 2).isUnread).toBe(true)
        expect(output.results.find((t: { id: number }) => t.id === 3).isUnread).toBe(false)

        consoleSpy.mockRestore()
    })

    it('--unread filters to unread threads only', async () => {
        setupClient({
            threads: [createThread(1), createThread(2), createThread(3)],
            unread: [{ threadId: 2 }],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--unread',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results).toHaveLength(1)
        expect(output.results[0].id).toBe(2)

        consoleSpy.mockRestore()
    })

    it('--since filters by lastUpdated', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-01T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-02-01T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-03-01T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--since',
            '2026-02-01',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.map((t: { id: number }) => t.id).sort()).toEqual([2, 3])

        consoleSpy.mockRestore()
    })

    it('--until filters by lastUpdated (exclusive)', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-01T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-02-01T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-03-01T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--until',
            '2026-02-01',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.map((t: { id: number }) => t.id)).toEqual([1])

        consoleSpy.mockRestore()
    })

    it('sorts newest-first by lastUpdated', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-01T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-03-01T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-02-01T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.map((t: { id: number }) => t.id)).toEqual([2, 3, 1])

        consoleSpy.mockRestore()
    })

    it('--limit truncates results and emits nextCursor', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-05T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-01-04T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-01-03T00:00:00Z') }),
                createThread(4, { lastUpdated: new Date('2026-01-02T00:00:00Z') }),
                createThread(5, { lastUpdated: new Date('2026-01-01T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--limit',
            '2',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.map((t: { id: number }) => t.id)).toEqual([1, 2])
        expect(output.nextCursor).toEqual(encodeCursor(2))

        consoleSpy.mockRestore()
    })

    it('--cursor advances to the next page', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-05T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-01-04T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-01-03T00:00:00Z') }),
                createThread(4, { lastUpdated: new Date('2026-01-02T00:00:00Z') }),
                createThread(5, { lastUpdated: new Date('2026-01-01T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--limit',
            '2',
            '--cursor',
            encodeCursor(2),
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results.map((t: { id: number }) => t.id)).toEqual([3, 4])
        expect(output.nextCursor).toEqual(encodeCursor(4))

        consoleSpy.mockRestore()
    })

    it('nextCursor is null on the last page', async () => {
        setupClient({
            threads: [createThread(1), createThread(2)],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.nextCursor).toBeNull()

        consoleSpy.mockRestore()
    })

    it('calls assertChannelIsPublic after resolving the channel', async () => {
        setupClient({ threads: [createThread(1)] })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        expect(vi.mocked(assertChannelIsPublic)).toHaveBeenCalledWith(100, 1)

        consoleSpy.mockRestore()
    })

    it('propagates the error when the channel is private and the guard rejects', async () => {
        setupClient({ threads: [createThread(1)] })
        vi.mocked(assertChannelIsPublic).mockRejectedValueOnce(
            new CliError('NOT_FOUND', 'This thread belongs to a private channel.'),
        )
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json']),
        ).rejects.toThrow('This thread belongs to a private channel.')
    })

    it('rejects an invalid --since with INVALID_DATE', async () => {
        setupClient({ threads: [createThread(1)] })
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'channel',
                'threads',
                '12345',
                '--since',
                'not-a-date',
                '--json',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_DATE')
    })

    it('rejects an invalid --until with INVALID_DATE', async () => {
        setupClient({ threads: [createThread(1)] })
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'channel',
                'threads',
                '12345',
                '--until',
                'junk',
                '--json',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_DATE')
    })

    it('rejects a malformed --cursor with INVALID_CURSOR', async () => {
        setupClient({ threads: [createThread(1)] })
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'channel',
                'threads',
                '12345',
                '--cursor',
                '!!!not-base64!!!',
                '--json',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_CURSOR')
    })

    it('prints empty-state message when no threads', async () => {
        refsMocks.resolveChannelRef.mockResolvedValue(channel(100, 'general'))
        setupClient({ threads: [] })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', 'general'])

        expect(consoleSpy).toHaveBeenCalledWith('No threads in #general.')

        consoleSpy.mockRestore()
    })

    it('--json emits isUnread and url without --full', async () => {
        setupClient({
            threads: [createThread(1)],
            unread: [{ threadId: 1 }],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results[0]).toMatchObject({
            id: 1,
            isUnread: true,
            url: 'https://twist.com/a/1/ch/100/t/1',
        })

        consoleSpy.mockRestore()
    })

    it('--ndjson emits one thread per line plus _meta terminator when paginated', async () => {
        setupClient({
            threads: [
                createThread(1, { lastUpdated: new Date('2026-01-05T00:00:00Z') }),
                createThread(2, { lastUpdated: new Date('2026-01-04T00:00:00Z') }),
                createThread(3, { lastUpdated: new Date('2026-01-03T00:00:00Z') }),
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'threads',
            '12345',
            '--ndjson',
            '--limit',
            '2',
        ])

        const lines = (consoleSpy.mock.calls[0][0] as string).split('\n')
        expect(lines).toHaveLength(3)
        const first = JSON.parse(lines[0])
        const second = JSON.parse(lines[1])
        const meta = JSON.parse(lines[2])
        expect(first.id).toBe(1)
        expect(second.id).toBe(2)
        expect(meta).toEqual({ _meta: true, nextCursor: encodeCursor(2) })

        consoleSpy.mockRestore()
    })

    it('--full bypasses the essential-field filter in JSON output', async () => {
        setupClient({
            threads: [createThread(1, { pinned: true })],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'threads', '12345', '--json', '--full'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.results[0]).toHaveProperty('pinned', true)

        consoleSpy.mockRestore()
    })
})

describe('cursor helpers', () => {
    it('encodes and decodes offsets round-trip', () => {
        expect(decodeCursor(encodeCursor(0))).toBe(0)
        expect(decodeCursor(encodeCursor(5))).toBe(5)
        expect(decodeCursor(encodeCursor(100))).toBe(100)
    })

    it('decodeCursor(undefined) returns 0', () => {
        expect(decodeCursor(undefined)).toBe(0)
    })

    it('throws INVALID_CURSOR on non-base64 input', () => {
        expect(() => decodeCursor('!!!nope!!!')).toThrowError(
            expect.objectContaining({ code: 'INVALID_CURSOR' }),
        )
    })

    it('throws INVALID_CURSOR when payload has no offset field', () => {
        const bad = Buffer.from(JSON.stringify({ foo: 1 })).toString('base64url')
        expect(() => decodeCursor(bad)).toThrowError(
            expect.objectContaining({ code: 'INVALID_CURSOR' }),
        )
    })

    it('throws INVALID_CURSOR when offset is negative', () => {
        const bad = Buffer.from(JSON.stringify({ offset: -1 })).toString('base64url')
        expect(() => decodeCursor(bad)).toThrowError(
            expect.objectContaining({ code: 'INVALID_CURSOR' }),
        )
    })
})
