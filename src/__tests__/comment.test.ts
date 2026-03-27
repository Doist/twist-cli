import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
}))

vi.mock('../lib/api.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/api.js')>()),
    getTwistClient: apiMocks.getTwistClient,
}))

vi.mock('../lib/input.js', () => ({
    readStdin: vi.fn().mockResolvedValue(''),
    openEditor: vi.fn().mockResolvedValue(''),
}))

vi.mock('chalk')

import { registerCommentCommand } from '../commands/comment.js'
import { readStdin } from '../lib/input.js'

function createClient() {
    return {
        comments: {
            updateComment: vi.fn(async (args: { id: number; content: string }) => ({
                id: args.id,
                content: args.content,
                creator: 2,
                threadId: 500,
                posted: new Date('2026-03-02T00:00:00.000Z'),
                reactions: [],
                url: `https://twist.com/a/10/ch/100/t/500/c/${args.id}`,
            })),
            deleteComment: vi.fn(async () => undefined),
        },
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerCommentCommand(program)
    return program
}

describe('comment edit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('edits a comment with positional content', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'edit', '300', 'Updated content'])

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
            'edit',
            '300',
            'New content',
            '--dry-run',
        ])

        expect(consoleSpy).toHaveBeenCalledWith('Dry run: would update comment 300')
        expect(consoleSpy).toHaveBeenCalledWith('New content')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'edit', '300', 'Updated', '--json'])

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

        await program.parseAsync(['node', 'tw', 'comment', 'edit', '300'])

        expect(client.comments.updateComment).toHaveBeenCalledWith({
            id: 300,
            content: 'Content from stdin',
        })
        consoleSpy.mockRestore()
    })

    it('errors when no content is provided', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit')
        })

        await expect(program.parseAsync(['node', 'tw', 'comment', 'edit', '300'])).rejects.toThrow(
            'process.exit',
        )

        expect(errorSpy).toHaveBeenCalledWith('No content provided.')
        expect(exitSpy).toHaveBeenCalledWith(1)

        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        exitSpy.mockRestore()
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
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'comment', 'delete', '300', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith('Dry run: would delete comment 300')
        consoleSpy.mockRestore()
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
