import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import type { BatchResponse as TwistBatchResponse } from '@doist/twist-sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

const configMocks = vi.hoisted(() => ({
    getConfig: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/config.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../lib/config.js')>()),
    getConfig: configMocks.getConfig,
}))

vi.mock('../../lib/public-channels.js', () => ({
    assertChannelIsPublic: vi.fn(),
}))

const groupsMock = vi.hoisted(() => ({
    getWorkspaceGroups: vi.fn().mockResolvedValue([]),
    getWorkspaceUsers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../lib/api.js')>()),
    getTwistClient: apiMocks.getTwistClient,
    getWorkspaceGroups: groupsMock.getWorkspaceGroups,
    getWorkspaceUsers: groupsMock.getWorkspaceUsers,
}))

vi.mock('../../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => Promise.resolve(text)),
}))

vi.mock('../../lib/input.js', () => ({
    readStdin: vi.fn().mockResolvedValue(''),
    openEditor: vi.fn().mockResolvedValue(''),
}))

vi.mock('chalk')

import { openEditor, readStdin } from '../../lib/input.js'
import { registerThreadCommand } from './index.js'

function createThreadFixture(id: number) {
    return {
        id,
        title: 'Test Thread',
        content: 'Thread body',
        creator: 1,
        channelId: 100,
        workspaceId: 10,
        posted: new Date('2026-03-01T00:00:00.000Z'),
        commentCount: 3,
        isArchived: false,
        reactions: [],
        url: `https://twist.com/a/10/ch/100/t/${id}`,
    }
}

function createComment(id: number, objIndex: number) {
    return {
        id,
        content: `Comment ${id}`,
        creator: 2,
        threadId: 500,
        posted: new Date('2026-03-02T00:00:00.000Z'),
        reactions: [],
        objIndex,
        url: `https://twist.com/a/10/ch/100/t/500/c/${id}`,
    }
}

type BatchResult = Pick<TwistBatchResponse<unknown>, 'code' | 'data'>

function createClient({
    thread = createThreadFixture(500),
    comments = [] as ReturnType<typeof createComment>[],
    unreadThreads = [] as Array<{
        threadId: number
        channelId: number
        objIndex: number
        directMention: boolean
    }>,
    users = {} as Record<number, { id: number; name: string }>,
    channel = { id: 100, name: 'General', workspaceId: 10 },
    sessionUser = { id: 1, name: 'Test User' },
} = {}) {
    return {
        threads: {
            getThread: vi.fn((_id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'thread', id: _id }
                return Promise.resolve(thread)
            }),
            getUnread: vi.fn(async () => unreadThreads),
            createThread: vi.fn(
                async (_args: { channelId: number; content: string; title?: string | null }) =>
                    createThreadFixture(999),
            ),
            closeThread: vi.fn(async (_args: { id: number; content: string }) =>
                createComment(10, 10),
            ),
            reopenThread: vi.fn(async (_args: { id: number; content: string }) =>
                createComment(11, 11),
            ),
            muteThread: vi.fn(async (_args: { id: number; minutes: number }) => ({
                ...thread,
                mutedUntil: new Date(Date.now() + _args.minutes * 60000),
            })),
            unmuteThread: vi.fn(async (_id: number) => ({
                ...thread,
                mutedUntil: null,
            })),
            deleteThread: vi.fn(async () => undefined),
            updateThread: vi.fn(
                async (_args: { id: number; title?: string | null; content?: string | null }) => ({
                    ...thread,
                    title: _args.title ?? thread.title,
                    content: _args.content ?? thread.content,
                }),
            ),
        },
        users: {
            getSessionUser: vi.fn((_options?: { batch?: boolean }) => {
                if (_options?.batch) return { kind: 'sessionUser' }
                return Promise.resolve(sessionUser)
            }),
        },
        comments: {
            getComments: vi.fn((_args: unknown, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'comments' }
                return Promise.resolve(comments)
            }),
            getComment: vi.fn((_id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'comment', id: _id }
                return Promise.resolve(undefined)
            }),
            createComment: vi.fn(
                async (_args: {
                    threadId: number
                    content: string
                    attachments?: Array<{ fileName?: string | null }>
                }) => createComment(12, 12),
            ),
        },
        attachments: {
            upload: vi.fn(async (args: { file: Blob; fileName: string }) => ({
                attachmentId: `att-${args.fileName}`,
                urlType: 'file',
                fileName: args.fileName,
            })),
        },
        channels: {
            getChannel: vi.fn((_id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'channel' }
                return Promise.resolve(channel)
            }),
        },
        inbox: {
            archiveThread: vi.fn(async () => undefined),
            unarchiveThread: vi.fn(async () => undefined),
        },
        workspaceUsers: {
            getUserById: vi.fn(
                (
                    { userId }: { workspaceId: number; userId: number },
                    options?: { batch?: boolean },
                ) => {
                    if (options?.batch) return { kind: 'user', userId }
                    return Promise.resolve(users[userId])
                },
            ),
        },
        batch: vi.fn(
            async (
                ...requests: Array<{ kind: string; id?: number; userId?: number }>
            ): Promise<BatchResult[]> =>
                requests.map((request): BatchResult => {
                    if (request.kind === 'thread') return { code: 200, data: thread }
                    if (request.kind === 'comments') return { code: 200, data: comments }
                    if (request.kind === 'comment') {
                        return {
                            code: 200,
                            data: comments.find((c) => c.id === request.id) ?? comments[0],
                        }
                    }
                    if (request.kind === 'channel') return { code: 200, data: channel }
                    if (request.kind === 'sessionUser') {
                        return { code: 200, data: sessionUser }
                    }
                    if (request.kind === 'user' && request.userId) {
                        return {
                            code: 200,
                            data: users[request.userId] ?? {
                                id: request.userId,
                                name: `user:${request.userId}`,
                            },
                        }
                    }
                    throw new Error(`Unexpected batch request: ${JSON.stringify(request)}`)
                }),
        ),
    }
}

const createProgram = () => createTestProgram(registerThreadCommand)

describe('thread implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockRejectedValue(new Error('MOCK_API_REACHED'))
    })

    it('tw thread <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        captureConsole()

        // If Commander routes to view, it will call getTwistClient which throws MOCK_API_REACHED.
        // If it doesn't route, Commander throws "unknown command '100'".
        await expect(program.parseAsync(['node', 'tw', 'thread', '100'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )
    })

    it('accepts id: prefixes in --notify for thread reply', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        groupsMock.getWorkspaceGroups.mockResolvedValue([])

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '100',
            'hello',
            '--notify',
            'id:123,456',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would post comment to thread'),
        )
    })

    it('--close dry-run indicates thread will be closed', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        groupsMock.getWorkspaceGroups.mockResolvedValue([])

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '100',
            'closing this',
            '--close',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would post comment to thread and close it'),
        )
    })

    it('--reopen dry-run indicates thread will be reopened', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        groupsMock.getWorkspaceGroups.mockResolvedValue([])

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '100',
            'reopening this',
            '--reopen',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would post comment to thread and reopen it'),
        )
    })

    it('--close calls closeThread instead of createComment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        vi.mocked(readStdin).mockResolvedValueOnce('closing comment')
        await program.parseAsync(['node', 'tw', 'thread', 'reply', '500', '--close'])

        expect(client.threads.closeThread).toHaveBeenCalledWith(
            expect.objectContaining({ id: 500, content: 'closing comment' }),
        )
        expect(client.comments.createComment).not.toHaveBeenCalled()
    })

    it('--reopen calls reopenThread instead of createComment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        vi.mocked(readStdin).mockResolvedValueOnce('reopening comment')
        await program.parseAsync(['node', 'tw', 'thread', 'reply', '500', '--reopen'])

        expect(client.threads.reopenThread).toHaveBeenCalledWith(
            expect.objectContaining({ id: 500, content: 'reopening comment' }),
        )
        expect(client.comments.createComment).not.toHaveBeenCalled()
    })

    it('--close and --reopen together produces an error', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'thread',
                'reply',
                '100',
                'content',
                '--close',
                '--reopen',
            ]),
        ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')
    })
})

describe('thread view --unread', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('shows original post and "No unread comments" when thread has no unread data', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Test Thread')
        expect(output).toContain('Thread body')
        expect(output).toContain('No unread comments.')
    })

    it('filters to only unread comments in human-readable output', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        // Should show original post
        expect(output).toContain('Thread body')
        // Should show unread comments (objIndex 2 and 3, which are > 1)
        expect(output).toContain('Comment 2')
        expect(output).toContain('Comment 3')
        // Should NOT show comment 1 (objIndex 1, which is <= lastReadObjIndex 1)
        expect(output).not.toContain('Comment 1')
        // Should show unread separator
        expect(output).toContain('UNREAD (2 new)')
    })

    it('filters comments in --json output when --unread is set', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 2, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.thread.id).toBe(500)
        // Only comment 3 is unread (objIndex 3 > lastReadObjIndex 2)
        expect(jsonOutput.comments).toHaveLength(1)
        expect(jsonOutput.comments[0].id).toBe(3)
    })

    it('returns empty comments in --json output when no unread data exists', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.thread.id).toBe(500)
        expect(jsonOutput.comments).toHaveLength(0)
    })

    it('filters comments in --ndjson output when --unread is set', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--ndjson'])

        const lines = consoleSpy.mock.calls.map((c) => JSON.parse(c[0]))
        // First line is the thread
        expect(lines[0].type).toBe('thread')
        // Only unread comments (objIndex > 1)
        const commentLines = lines.filter((l) => l.type === 'comment')
        expect(commentLines).toHaveLength(2)
        expect(commentLines[0].id).toBe(2)
        expect(commentLines[1].id).toBe(3)
    })

    it('returns all comments in --json without --unread', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        // Without --unread, all comments are returned
        expect(jsonOutput.comments).toHaveLength(2)
        // getUnread should not be called
        expect(client.threads.getUnread).not.toHaveBeenCalled()
    })
})

describe('thread view --since', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('maps --since to newerThan for getComments', async () => {
        const client = createClient({
            comments: [createComment(1, 1)],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'view',
            '500',
            '--since',
            '2026-01-01',
            '--json',
        ])

        expect(client.comments.getComments).toHaveBeenCalledWith(
            expect.objectContaining({
                threadId: 500,
                newerThan: new Date('2026-01-01'),
            }),
            { batch: true },
        )
        const [args] = client.comments.getComments.mock.calls[0] as [Record<string, unknown>]
        expect(args).not.toHaveProperty('from')
    })
})

describe('thread view with failed batch response', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('throws a clear error when comment batch response fails', async () => {
        const client = createClient({
            users: { 1: { id: 1, name: 'Alice' } },
        })
        // Override batch to return a 404 for the comment
        client.batch.mockResolvedValueOnce([
            { code: 200, data: createThreadFixture(500) },
            { code: 404, data: null as never },
        ])
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--comment', '99999']),
        ).rejects.toThrow('Failed to fetch comment 99999.')
    })

    it('throws a clear error when thread batch response fails', async () => {
        const client = createClient()
        // Override batch to return a 404 for the thread
        client.batch.mockResolvedValueOnce([
            { code: 404, data: null as never },
            { code: 200, data: [] },
        ])
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await expect(program.parseAsync(['node', 'tw', 'thread', 'view', '500'])).rejects.toThrow(
            'Failed to fetch thread.',
        )
    })
})

describe('thread view with failed user batch response', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('throws a clear error when a batched user lookup fails', async () => {
        const comments = [createComment(1, 1)]
        const client = createClient({
            comments,
            users: {
                1: { id: 1, name: 'Alice' },
                2: { id: 2, name: 'Bob' },
            },
        })
        client.batch
            .mockResolvedValueOnce([
                { code: 200, data: createThreadFixture(500) },
                { code: 200, data: comments },
            ])
            .mockResolvedValueOnce([
                { code: 200, data: { id: 100, name: 'General', workspaceId: 10 } },
                { code: 200, data: { id: 1, name: 'Alice' } },
                { code: 403, data: { errorString: 'User lookup failed' } },
            ])
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()

        await expect(program.parseAsync(['node', 'tw', 'thread', 'view', '500'])).rejects.toThrow(
            'Failed to fetch user 2: User lookup failed',
        )
    })

    it('renders the thread when a user lookup returns null data with a success code', async () => {
        const comments = [createComment(1, 1), createComment(2, 2)]
        const client = createClient({
            comments,
            users: { 1: { id: 1, name: 'Alice' } },
        })
        client.batch
            .mockResolvedValueOnce([
                { code: 200, data: createThreadFixture(500) },
                { code: 200, data: comments },
            ])
            .mockResolvedValueOnce([
                { code: 200, data: { id: 100, name: 'General', workspaceId: 10 } },
                { code: 200, data: { id: 1, name: 'Alice' } },
                { code: 200, data: null },
            ])
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Alice')
        expect(output).toContain('user:2')
    })
})

describe('thread create', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        configMocks.getConfig.mockResolvedValue({})
    })

    it('creates a thread with positional title and content', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'My Title',
            'Thread body content',
        ])

        expect(client.threads.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                channelId: 100,
                title: 'My Title',
                content: 'Thread body content',
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Thread created:'))
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'Test Title',
            'Dry run content',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Title: Test Title')
        expect(consoleSpy).toHaveBeenCalledWith('  Content: Dry run content')
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'Title',
            'Thread body',
            '--json',
        ])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(999)
        expect(jsonOutput.channelId).toBe(100)
    })

    it('reads content from stdin', async () => {
        vi.mocked(readStdin).mockResolvedValueOnce('Content from stdin')
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'create', '100', 'My Title'])

        expect(client.threads.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                channelId: 100,
                title: 'My Title',
                content: 'Content from stdin',
            }),
        )
    })

    it('passes notify recipients (users only)', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        groupsMock.getWorkspaceGroups.mockResolvedValue([])
        groupsMock.getWorkspaceUsers.mockResolvedValue([
            { id: 123, name: 'Alice' },
            { id: 456, name: 'Bob' },
        ])

        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'Title',
            'Thread body',
            '--notify',
            '123,456',
        ])

        expect(client.threads.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                channelId: 100,
                content: 'Thread body',
                recipients: [123, 456],
            }),
        )
    })

    it('partitions notify IDs into users and groups', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        groupsMock.getWorkspaceGroups.mockResolvedValue([
            { id: 456, name: 'Frontend', workspaceId: 10, userIds: [1, 2], version: 1 },
        ])
        groupsMock.getWorkspaceUsers.mockResolvedValue([{ id: 123, name: 'Alice' }])

        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'Title',
            'Thread body',
            '--notify',
            '123,456',
        ])

        expect(client.threads.createThread).toHaveBeenCalledWith(
            expect.objectContaining({
                channelId: 100,
                content: 'Thread body',
                recipients: [123],
                groups: [456],
            }),
        )
    })

    it('errors when no content is provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'create', '100', 'My Title']),
        ).rejects.toHaveProperty('code', 'MISSING_CONTENT')
    })

    it('does not unarchive by default', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'create', '100', 'T', 'body'])

        expect(client.inbox.unarchiveThread).not.toHaveBeenCalled()
    })

    it('unarchives the new thread when --unarchive is passed', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'T',
            'body',
            '--unarchive',
        ])

        expect(client.inbox.unarchiveThread).toHaveBeenCalledWith(999)
    })

    it('unarchives when userSettings.unarchiveNewThreads is true', async () => {
        configMocks.getConfig.mockResolvedValueOnce({
            userSettings: { unarchiveNewThreads: true },
        })
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'create', '100', 'T', 'body'])

        expect(client.inbox.unarchiveThread).toHaveBeenCalledWith(999)
    })

    it('--no-unarchive overrides config default of true', async () => {
        configMocks.getConfig.mockResolvedValueOnce({
            userSettings: { unarchiveNewThreads: true },
        })
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'T',
            'body',
            '--no-unarchive',
        ])

        expect(client.inbox.unarchiveThread).not.toHaveBeenCalled()
    })

    it('unarchive failure does not fail the command', async () => {
        const client = createClient()
        client.inbox.unarchiveThread.mockRejectedValueOnce(new Error('boom'))
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()
        const errorSpy = captureConsole('error')

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'create',
            '100',
            'T',
            'body',
            '--unarchive',
        ])

        expect(client.threads.createThread).toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failed to unarchive'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Thread created:'))
    })
})

describe('thread mute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('mutes a thread with default 60 minutes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'mute', '500'])

        expect(client.threads.muteThread).toHaveBeenCalledWith({ id: 500, minutes: 60 })
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 muted for 60 minutes.')
    })

    it('mutes a thread with custom minutes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'mute', '500', '--minutes', '480'])

        expect(client.threads.muteThread).toHaveBeenCalledWith({ id: 500, minutes: 480 })
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 muted for 480 minutes.')
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'mute', '500', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would mute thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(consoleSpy).toHaveBeenCalledWith('  Duration: 60 minutes')
        expect(client.threads.muteThread).not.toHaveBeenCalled()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        client.threads.getThread.mockRejectedValueOnce(new Error('thread not found'))

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'mute', '500', '--dry-run']),
        ).rejects.toThrow('thread not found')
        expect(client.threads.muteThread).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json including id and mutedUntil', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'mute', '500', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(500)
        expect(jsonOutput.mutedUntil).toBeDefined()
        expect(Object.keys(jsonOutput)).toEqual(['id', 'mutedUntil'])
    })

    it('rejects non-integer --minutes value', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'mute', '500', '--minutes', 'foo']),
        ).rejects.toHaveProperty('code', 'INVALID_MINUTES')
    })
})

describe('thread unmute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('unmutes a thread', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'unmute', '500'])

        expect(client.threads.unmuteThread).toHaveBeenCalledWith(500)
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 unmuted.')
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'unmute', '500', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would unmute thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(client.threads.unmuteThread).not.toHaveBeenCalled()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        client.threads.getThread.mockRejectedValueOnce(new Error('thread not found'))

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'unmute', '500', '--dry-run']),
        ).rejects.toThrow('thread not found')
        expect(client.threads.unmuteThread).not.toHaveBeenCalled()
    })
})

describe('thread delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deletes a thread with --yes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'delete', '500', '--yes'])

        expect(client.threads.deleteThread).toHaveBeenCalledWith(500)
        expect(consoleSpy).toHaveBeenCalledWith('Thread Test Thread (500) deleted.')
    })

    it('prompts for confirmation without --yes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'delete', '500'])

        expect(consoleSpy).toHaveBeenCalledWith('Would delete: Test Thread')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        expect(client.threads.deleteThread).not.toHaveBeenCalled()
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'delete', '500', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(client.threads.deleteThread).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json --yes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'delete', '500', '--json', '--yes'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual({ id: 500, deleted: true })
    })

    it('errors when --json is used without --yes', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'delete', '500', '--json']),
        ).rejects.toHaveProperty('code', 'MISSING_YES_FLAG')

        expect(client.threads.deleteThread).not.toHaveBeenCalled()
    })

    it('errors when thread creator does not match session user', async () => {
        const client = createClient({ sessionUser: { id: 999, name: 'Other User' } })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'delete', '500', '--yes']),
        ).rejects.toHaveProperty('code', 'NOT_CREATOR')

        expect(client.threads.deleteThread).not.toHaveBeenCalled()
    })
})

describe('thread rename', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renames a thread', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'rename', '500', 'New Title'])

        expect(client.threads.updateThread).toHaveBeenCalledWith({ id: 500, title: 'New Title' })
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 renamed to "New Title".')
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'rename',
            '500',
            'New Title',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would rename thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(consoleSpy).toHaveBeenCalledWith('  New title: New Title')
        expect(client.threads.updateThread).not.toHaveBeenCalled()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        client.threads.getThread.mockRejectedValueOnce(new Error('thread not found'))

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'rename', '500', 'New Title', '--dry-run']),
        ).rejects.toThrow('thread not found')
        expect(client.threads.updateThread).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json including id and title', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'rename', '500', 'New Title', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(500)
        expect(jsonOutput.title).toBe('New Title')
        expect(Object.keys(jsonOutput)).toEqual(['id', 'title'])
    })

    it('outputs full JSON with --json --full', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'rename',
            '500',
            'New Title',
            '--json',
            '--full',
        ])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(500)
        expect(jsonOutput.title).toBe('New Title')
        // Full output includes more fields
        expect(Object.keys(jsonOutput).length).toBeGreaterThan(2)
    })
})

describe('thread update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates a thread body', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'update', '500', 'New body'])

        expect(client.threads.updateThread).toHaveBeenCalledWith({
            id: 500,
            content: 'New body',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 updated.')
    })

    it('shows dry run output without calling updateThread', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'update', '500', 'New body', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(consoleSpy).toHaveBeenCalledWith('  Content: New body')
        expect(client.threads.updateThread).not.toHaveBeenCalled()
    })

    it('reads content from stdin', async () => {
        vi.mocked(readStdin).mockResolvedValueOnce('Body from stdin')
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'update', '500'])

        expect(client.threads.updateThread).toHaveBeenCalledWith({
            id: 500,
            content: 'Body from stdin',
        })
    })

    it('errors when no content is provided', async () => {
        const program = createProgram()
        captureConsole()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'update', '500']),
        ).rejects.toHaveProperty('code', 'MISSING_CONTENT')
    })

    it('outputs JSON with --json including id and content', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'update', '500', 'New body', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(500)
        expect(jsonOutput.content).toBe('New body')
        expect(Object.keys(jsonOutput)).toEqual(['id', 'content'])
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        client.threads.getThread.mockRejectedValueOnce(new Error('thread not found'))

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'update', '500', 'New body', '--dry-run']),
        ).rejects.toThrow('thread not found')
        expect(client.threads.updateThread).not.toHaveBeenCalled()
    })
})

describe('thread done', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('archives a thread', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'done', '500'])

        expect(client.inbox.archiveThread).toHaveBeenCalledWith(500)
        expect(consoleSpy).toHaveBeenCalledWith('Thread 500 archived.')
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'thread', 'done', '500', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would archive thread'))
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: Test Thread (500)')
        expect(client.inbox.archiveThread).not.toHaveBeenCalled()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        client.threads.getThread.mockRejectedValueOnce(new Error('thread not found'))

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'thread', 'done', '500', '--dry-run']),
        ).rejects.toThrow('thread not found')
        expect(client.inbox.archiveThread).not.toHaveBeenCalled()
    })
})

describe('thread reply --file', () => {
    let tmpDir: string
    let filePng: string
    let filePdf: string

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'tw-reply-'))
        filePng = join(tmpDir, 'diagram.png')
        filePdf = join(tmpDir, 'report.pdf')
        await writeFile(filePng, 'png-bytes')
        await writeFile(filePdf, 'pdf-bytes')
    })

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true })
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uploads the file and attaches it to the comment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()

        const program = createProgram()
        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '500',
            'See attached',
            '--file',
            filePng,
        ])

        expect(client.attachments.upload).toHaveBeenCalledTimes(1)
        expect(client.attachments.upload).toHaveBeenCalledWith(
            expect.objectContaining({ fileName: 'diagram.png' }),
        )
        expect(client.comments.createComment).toHaveBeenCalledWith(
            expect.objectContaining({
                threadId: 500,
                content: 'See attached',
                attachments: [expect.objectContaining({ fileName: 'diagram.png' })],
            }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Attached: diagram.png'))
    })

    it('attaches multiple repeated --file values', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '500',
            'two files',
            '--file',
            filePng,
            '--file',
            filePdf,
        ])

        expect(client.attachments.upload).toHaveBeenCalledTimes(2)
        const args = client.comments.createComment.mock.calls[0][0] as {
            attachments: Array<{ fileName?: string }>
        }
        expect(args.attachments.map((a) => a.fileName)).toEqual(['diagram.png', 'report.pdf'])
    })

    it('allows a file-only reply with no text content', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'thread', 'reply', '500', '--file', filePng])

        expect(client.comments.createComment).toHaveBeenCalledWith(
            expect.objectContaining({ content: '', attachments: expect.any(Array) }),
        )
        // A file-only reply must not block on the editor.
        expect(openEditor).not.toHaveBeenCalled()
    })

    it('errors with FILE_NOT_FOUND for a missing path and does not post', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        await expect(
            program.parseAsync([
                'node',
                'tw',
                'thread',
                'reply',
                '500',
                'x',
                '--file',
                join(tmpDir, 'missing.png'),
            ]),
        ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })

        expect(client.attachments.upload).not.toHaveBeenCalled()
        expect(client.comments.createComment).not.toHaveBeenCalled()
    })

    it('rejects --file combined with --close', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        await expect(
            program.parseAsync([
                'node',
                'tw',
                'thread',
                'reply',
                '500',
                'x',
                '--close',
                '--file',
                filePng,
            ]),
        ).rejects.toMatchObject({ code: 'CONFLICTING_OPTIONS' })

        expect(client.attachments.upload).not.toHaveBeenCalled()
    })

    it('does not upload during --dry-run but lists the attachment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()

        const program = createProgram()
        await program.parseAsync([
            'node',
            'tw',
            'thread',
            'reply',
            '500',
            'preview',
            '--file',
            filePng,
            '--dry-run',
        ])

        expect(client.attachments.upload).not.toHaveBeenCalled()
        expect(client.comments.createComment).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(filePng))
    })
})
