import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
}))

import { registerReactCommand } from '../commands/react.js'

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
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'react',
            'thread',
            'https://twist.com/a/1/ch/2/t/99',
            '+1',
        ])

        expect(apiMocks.addReaction).toHaveBeenCalledWith({ threadId: 99, reaction: '👍' })
        logSpy.mockRestore()
    })

    it('accepts message URLs for unreact', async () => {
        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'unreact',
            'message',
            'https://twist.com/a/1/msg/33/m/44',
            'heart',
        ])

        expect(apiMocks.removeReaction).toHaveBeenCalledWith({ messageId: 44, reaction: '❤️' })
        logSpy.mockRestore()
    })
})
