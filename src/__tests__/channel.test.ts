import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('../lib/public-channels.js', () => ({
    includePrivateChannels: vi.fn().mockReturnValue(true),
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

import { registerChannelCommand } from '../commands/channel.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChannelCommand(program)
    return program
}

describe('channels --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channels', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
