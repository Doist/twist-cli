import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

vi.mock('../../lib/public-channels.js', () => ({
    assertChannelIsPublic: vi.fn(),
}))

vi.mock('../../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../lib/api.js')>()),
    getTwistClient: apiMocks.getTwistClient,
}))

vi.mock('../../lib/input.js', () => ({
    readStdin: vi.fn().mockResolvedValue(''),
    openEditor: vi.fn().mockResolvedValue(''),
}))

vi.mock('../../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => Promise.resolve(text)),
}))

vi.mock('chalk')

import { readStdin } from '../../lib/input.js'
import { registerCommentCommand } from './index.js'

function createCommentFixture(id: number, creator = 1) {
    return {
        id,
        content: `Comment ${id}`,
        creator,
        threadId: 500,
        channelId: 100,
        workspaceId: 10,
        posted: new Date('2026-03-02T00:00:00.000Z'),
        reactions: [],
        url: `https://twist.com/a/10/ch/100/t/500/c/${id}`,
    }
}

function createClient({ commentCreator = 1, sessionUserId = 1 } = {}) {
    return {
        comments: {
            getComment: vi.fn((id: number, options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'comment', id }
                return Promise.resolve(createCommentFixture(id, commentCreator))
            }),
            updateComment: vi.fn(async (args: { id: number; content: string }) => ({
                ...createCommentFixture(args.id, commentCreator),
                content: args.content,
            })),
            deleteComment: vi.fn(async () => undefined),
        },
        users: {
            getSessionUser: vi.fn((options?: { batch?: boolean }) => {
                if (options?.batch) return { kind: 'sessionUser' }
                return Promise.resolve({ id: sessionUserId, name: 'Me' })
            }),
        },
        workspaceUsers: {
            getUserById: vi.fn(async () => ({ id: 2, name: 'Bob' })),
        },
        batch: vi.fn(async (...requests: Array<{ kind: string; id?: number }>) =>
            requests.map((request) => {
                if (request.kind === 'comment' && request.id) {
                    return { code: 200, data: createCommentFixture(request.id, commentCreator) }
                }
                if (request.kind === 'sessionUser') {
                    return { code: 200, data: { id: sessionUserId, name: 'Me' } }
                }
                throw new Error(`Unexpected batch request: ${JSON.stringify(request)}`)
            }),
        ),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerCommentCommand(program)
    return program
}

describe('comment implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockRejectedValue(new Error('MOCK_API_REACHED'))
    })

    it('tw comment <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await expect(program.parseAsync(['node', 'tw', 'comment', '300'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })
})

describe('comment view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('views a comment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'view', '300'])

        expect(client.comments.getComment).toHaveBeenCalledWith(300)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Comment 300'))
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'view', '300', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(300)
        expect(jsonOutput.content).toBe('Comment 300')
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'view', '300', '--ndjson'])

        const line = consoleSpy.mock.calls[0][0]
        expect(line).not.toContain('\n')
        const parsed = JSON.parse(line)
        expect(parsed.id).toBe(300)
        expect(parsed.content).toBe('Comment 300')
        consoleSpy.mockRestore()
    })

    it('includes creatorName in --json --full output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'view', '300', '--json', '--full'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(300)
        expect(jsonOutput.creatorName).toBe('Bob')
        consoleSpy.mockRestore()
    })
})

describe('comment update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates a comment with positional content', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'update', '300', 'Updated content'])

        expect(client.comments.updateComment).toHaveBeenCalledWith({
            id: 300,
            content: 'Updated content',
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Comment updated:'))
        consoleSpy.mockRestore()
    })

    it('shows dry run output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'comment',
            'update',
            '300',
            'New content',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update comment'))
        expect(consoleSpy).toHaveBeenCalledWith('  Comment: 300')
        expect(consoleSpy).toHaveBeenCalledWith('  Content: New content')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'update', '300', 'Updated', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(300)
        expect(jsonOutput.content).toBe('Updated')
        consoleSpy.mockRestore()
    })

    it('reads content from stdin', async () => {
        vi.mocked(readStdin).mockResolvedValueOnce('Content from stdin')
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'update', '300'])

        expect(client.comments.updateComment).toHaveBeenCalledWith({
            id: 300,
            content: 'Content from stdin',
        })
        consoleSpy.mockRestore()
    })

    it('errors when no content is provided', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await expect(
            program.parseAsync(['node', 'tw', 'comment', 'update', '300']),
        ).rejects.toHaveProperty('code', 'MISSING_CONTENT')

        consoleSpy.mockRestore()
    })
})

describe('comment delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deletes a comment', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'delete', '300'])

        expect(client.comments.deleteComment).toHaveBeenCalledWith(300)
        expect(consoleSpy).toHaveBeenCalledWith('Comment 300 deleted.')
        consoleSpy.mockRestore()
    })

    it('shows dry run output', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'delete', '300', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete comment'))
        expect(consoleSpy).toHaveBeenCalledWith('  Comment: 300')
        expect(consoleSpy).toHaveBeenCalledWith('  Thread: 500')
        expect(client.comments.deleteComment).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('rejects non-creator with NOT_CREATOR in dry-run', async () => {
        const client = createClient({ commentCreator: 99, sessionUserId: 1 })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'comment', 'delete', '300', '--dry-run']),
        ).rejects.toHaveProperty('code', 'NOT_CREATOR')
        expect(client.comments.deleteComment).not.toHaveBeenCalled()
    })

    it('rejects when assertChannelIsPublic throws in dry-run', async () => {
        const { assertChannelIsPublic } = await import('../../lib/public-channels.js')
        vi.mocked(assertChannelIsPublic).mockRejectedValueOnce(new Error('channel is private'))

        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'comment', 'delete', '300', '--dry-run']),
        ).rejects.toThrow('channel is private')
        expect(client.comments.deleteComment).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'delete', '300', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual({ id: 300, deleted: true })
        consoleSpy.mockRestore()
    })
})
