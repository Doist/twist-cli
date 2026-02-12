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

vi.mock('chalk', () => ({
    default: {
        bold: Object.assign(
            vi.fn((text: string) => text),
            {
                blue: vi.fn((text: string) => text),
            },
        ),
        dim: vi.fn((text: string) => text),
        blue: vi.fn((text: string) => text),
    },
}))

import { registerMsgCommand } from '../commands/msg.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerMsgCommand(program)
    return program
}

describe('msg implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('tw msg <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await expect(program.parseAsync(['node', 'tw', 'msg', '100'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })
})

describe('msg unread --workspace conflict', () => {
    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'msg', 'unread', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
