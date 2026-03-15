import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

vi.mock('../lib/api.js', () => apiMocks)

vi.mock('../lib/public-channels.js', () => ({
    assertChannelIsPublic: vi.fn(),
}))

vi.mock('../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => text),
}))

vi.mock('../lib/input.js', () => ({
    readStdin: vi.fn().mockResolvedValue(''),
    openEditor: vi.fn().mockResolvedValue(''),
}))

vi.mock('chalk')

import { registerThreadCommand } from '../commands/thread.js'

function createThread(id: number) {
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
    }
}

function createClient({
    thread = createThread(500),
    comments = [] as ReturnType<typeof createComment>[],
    unreadThreads = [] as Array<{
        threadId: number
        channelId: number
        objIndex: number
        directMention: boolean
    }>,
    users = {} as Record<number, { id: number; name: string }>,
    channel = { id: 100, name: 'General' },
} = {}) {
    return {
        threads: {
            getThread: vi.fn((_id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'thread', id: _id }
                return Promise.resolve(thread)
            }),
            getUnread: vi.fn(async () => unreadThreads),
        },
        comments: {
            getComments: vi.fn((_args: unknown, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'comments' }
                return Promise.resolve(comments)
            }),
            getComment: vi.fn(),
        },
        channels: {
            getChannel: vi.fn((_id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'channel' }
                return Promise.resolve(channel)
            }),
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
        batch: vi.fn(async (...requests: Array<{ kind: string; id?: number; userId?: number }>) =>
            requests.map((request) => {
                if (request.kind === 'thread') return { data: thread }
                if (request.kind === 'comments') return { data: comments }
                if (request.kind === 'channel') return { data: channel }
                if (request.kind === 'user' && request.userId) {
                    return {
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

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerThreadCommand(program)
    return program
}

describe('thread implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockRejectedValue(new Error('MOCK_API_REACHED'))
    })

    it('tw thread <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        // If Commander routes to view, it will call getTwistClient which throws MOCK_API_REACHED.
        // If it doesn't route, Commander throws "unknown command '100'".
        await expect(program.parseAsync(['node', 'tw', 'thread', '100'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })

    it('accepts id: prefixes in --notify for thread reply', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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

        expect(consoleSpy).toHaveBeenCalledWith('Dry run: would post comment to thread', 100)
        consoleSpy.mockRestore()
    })
})

describe('thread view --unread', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows original post and "No unread comments" when thread has no unread data', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Test Thread')
        expect(output).toContain('Thread body')
        expect(output).toContain('No unread comments.')

        consoleSpy.mockRestore()
    })

    it('filters to only unread comments in human-readable output', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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

        consoleSpy.mockRestore()
    })

    it('filters comments in --json output when --unread is set', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 2, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.thread.id).toBe(500)
        // Only comment 3 is unread (objIndex 3 > lastReadObjIndex 2)
        expect(jsonOutput.comments).toHaveLength(1)
        expect(jsonOutput.comments[0].id).toBe(3)

        consoleSpy.mockRestore()
    })

    it('returns empty comments in --json output when no unread data exists', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.thread.id).toBe(500)
        expect(jsonOutput.comments).toHaveLength(0)

        consoleSpy.mockRestore()
    })

    it('filters comments in --ndjson output when --unread is set', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2), createComment(3, 3)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--unread', '--ndjson'])

        const lines = consoleSpy.mock.calls.map((c) => JSON.parse(c[0]))
        // First line is the thread
        expect(lines[0].type).toBe('thread')
        // Only unread comments (objIndex > 1)
        const commentLines = lines.filter((l) => l.type === 'comment')
        expect(commentLines).toHaveLength(2)
        expect(commentLines[0].id).toBe(2)
        expect(commentLines[1].id).toBe(3)

        consoleSpy.mockRestore()
    })

    it('returns all comments in --json without --unread', async () => {
        const client = createClient({
            comments: [createComment(1, 1), createComment(2, 2)],
            unreadThreads: [{ threadId: 500, channelId: 100, objIndex: 1, directMention: false }],
            users: { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } },
        })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'thread', 'view', '500', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        // Without --unread, all comments are returned
        expect(jsonOutput.comments).toHaveLength(2)
        // getUnread should not be called
        expect(client.threads.getUnread).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })
})
