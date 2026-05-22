import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureConsole } from '../test-helpers/console.js'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
}))

import { registerReactCommand } from './react.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerReactCommand(program)
    return program
}

describe('react refs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.addReaction.mockResolvedValue(undefined)
        apiMocks.removeReaction.mockResolvedValue(undefined)
        apiMocks.getTwistClient.mockResolvedValue({
            reactions: {
                add: apiMocks.addReaction,
                remove: apiMocks.removeReaction,
            },
        })
    })

    it('accepts thread URLs for react', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'react',
            'thread',
            'https://twist.com/a/1/ch/2/t/99',
            '+1',
        ])

        expect(apiMocks.addReaction).toHaveBeenCalledWith({ threadId: 99, reaction: '👍' })
    })

    it('accepts message URLs for unreact', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'unreact',
            'message',
            'https://twist.com/a/1/msg/33/m/44',
            'heart',
        ])

        expect(apiMocks.removeReaction).toHaveBeenCalledWith({ messageId: 44, reaction: '❤️' })
    })

    it('outputs JSON for react --json', async () => {
        const program = createProgram()
        const logSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'react', 'thread', '99', '+1', '--json'])

        expect(apiMocks.addReaction).toHaveBeenCalledWith({ threadId: 99, reaction: '👍' })
        const output = JSON.parse(logSpy.mock.calls[0][0])
        expect(output).toEqual({
            targetType: 'thread',
            targetId: 99,
            emoji: '👍',
            action: 'added',
        })
    })

    it('outputs JSON for unreact --json', async () => {
        const program = createProgram()
        const logSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'unreact', 'comment', '42', 'heart', '--json'])

        expect(apiMocks.removeReaction).toHaveBeenCalledWith({ commentId: 42, reaction: '❤️' })
        const output = JSON.parse(logSpy.mock.calls[0][0])
        expect(output).toEqual({
            targetType: 'comment',
            targetId: 42,
            emoji: '❤️',
            action: 'removed',
        })
    })

    it('outputs JSON for react --json --dry-run without calling API', async () => {
        const program = createProgram()
        const logSpy = captureConsole()

        await program.parseAsync([
            'node',
            'tw',
            'react',
            'message',
            '77',
            'tada',
            '--json',
            '--dry-run',
        ])

        expect(apiMocks.addReaction).not.toHaveBeenCalled()
        const output = JSON.parse(logSpy.mock.calls[0][0])
        expect(output).toEqual({
            targetType: 'message',
            targetId: 77,
            emoji: '🎉',
            action: 'added',
            dryRun: true,
        })
    })
})
