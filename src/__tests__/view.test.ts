import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../commands/thread/index.js', () => ({
    registerThreadCommand: (program: Command) => {
        const thread = program.command('thread')
        thread.command('view [ref]').action(() => {
            throw new Error('ROUTED_TO_THREAD')
        })
    },
}))

vi.mock('../commands/conversation/index.js', () => ({
    registerConversationCommand: (program: Command) => {
        const convo = program.command('conversation')
        convo.command('view [ref]').action(() => {
            throw new Error('ROUTED_TO_CONVERSATION')
        })
    },
}))

vi.mock('../commands/msg/index.js', () => ({
    registerMsgCommand: (program: Command) => {
        const msg = program.command('msg')
        msg.command('view [ref]').action(() => {
            throw new Error('ROUTED_TO_MSG')
        })
    },
}))

import { registerViewCommand } from '../commands/view.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerViewCommand(program)
    return program
}

describe('tw view <url> routing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('routes thread URL to thread view', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'view', 'https://twist.com/a/1585/ch/100/t/200']),
        ).rejects.toThrow('ROUTED_TO_THREAD')
    })

    it('routes comment URL (thread+comment) to thread view', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync([
                'node',
                'tw',
                'view',
                'https://twist.com/a/1585/ch/100/t/200/c/300',
            ]),
        ).rejects.toThrow('ROUTED_TO_THREAD')
    })

    it('routes conversation URL to conversation view', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'view', 'https://twist.com/a/1585/msg/400']),
        ).rejects.toThrow('ROUTED_TO_CONVERSATION')
    })

    it('routes message URL to msg view', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'view', 'https://twist.com/a/1585/msg/400/m/500']),
        ).rejects.toThrow('ROUTED_TO_MSG')
    })

    it('throws for unrecognized Twist URL', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'view', 'https://twist.com/a/1585']),
        ).rejects.toThrow('Not a recognized Twist URL')
    })

    it('throws for non-Twist URL', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'view', 'https://google.com/something']),
        ).rejects.toThrow('Not a recognized Twist URL')
    })
})
