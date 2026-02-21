import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getTwistClient: vi.fn().mockRejectedValue(new Error('MOCK_API_REACHED')),
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
}))

vi.mock('../lib/refs.js', () => ({
    resolveConversationId: vi.fn().mockReturnValue(100),
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => text),
}))

vi.mock('chalk')

import { registerConversationCommand } from '../commands/conversation.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerConversationCommand(program)
    return program
}

describe('conversation implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('tw conversation <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await expect(program.parseAsync(['node', 'tw', 'conversation', '100'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })
})

describe('conversation unread --workspace conflict', () => {
    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'conversation',
                'unread',
                'Doist',
                '--workspace',
                'Other',
            ]),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
