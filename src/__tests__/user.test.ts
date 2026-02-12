import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getSessionUser: vi.fn(),
    getWorkspaceUsers: vi.fn(),
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('chalk', () => ({
    default: {
        bold: vi.fn((text: string) => text),
        dim: vi.fn((text: string) => text),
    },
}))

import { registerUserCommand } from '../commands/user.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerUserCommand(program)
    return program
}

describe('users --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'users', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
