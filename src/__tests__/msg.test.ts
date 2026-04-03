import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getTwistClient: vi.fn().mockRejectedValue(new Error('MOCK_API_REACHED')),
}))

vi.mock('../lib/refs.js', () => ({
    resolveMessageId: vi.fn().mockReturnValue(200),
}))

vi.mock('../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => text),
}))

vi.mock('chalk')

import { registerMsgCommand } from '../commands/msg/index.js'

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

        await expect(program.parseAsync(['node', 'tw', 'msg', '200'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })
})
