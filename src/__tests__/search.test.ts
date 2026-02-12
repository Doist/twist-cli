import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
    resolveUserRefs: vi.fn(),
}))

vi.mock('../lib/public-channels.js', () => ({
    includePrivateChannels: vi.fn().mockReturnValue(true),
    getPublicChannelIds: vi.fn(),
}))

vi.mock('../lib/search-api.js', () => ({
    extendedSearch: vi.fn(),
}))

vi.mock('chalk', () => ({
    default: {
        bold: vi.fn((text: string) => text),
        dim: vi.fn((text: string) => text),
    },
}))

import { registerSearchCommand } from '../commands/search.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSearchCommand(program)
    return program
}

describe('search --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'search', 'query', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
