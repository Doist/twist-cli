import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getTwistClient: vi.fn().mockRejectedValue(new Error('MOCK_API_REACHED')),
}))

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

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerThreadCommand(program)
    return program
}

describe('thread implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
