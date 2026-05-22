import { describeEmptyMachineOutput } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureConsole } from '../test-helpers/console.js'
import { createTestProgram } from '../test-helpers/program.js'

const apiMocks = vi.hoisted(() => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getSessionUser: vi.fn(),
    getWorkspaceUsers: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
    getSessionUser: apiMocks.getSessionUser,
    getWorkspaceUsers: apiMocks.getWorkspaceUsers,
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('chalk')

import { registerUserCommand } from './user.js'

const createProgram = () => createTestProgram(registerUserCommand)

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

describeEmptyMachineOutput('tw users empty output', {
    setup: () => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        apiMocks.getWorkspaceUsers.mockResolvedValue([])
    },
    run: async (extraArgs) => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'users', ...extraArgs])
    },
    humanMessage: 'No users found.',
})

describe('user --json', () => {
    const sampleUser = {
        id: 42,
        name: 'Jane Smith',
        email: 'jane@example.com',
        timezone: 'America/New_York',
        userType: 'regular',
        awayMode: null,
        defaultWorkspace: 1,
        lang: 'en',
        shortName: 'Jane',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getSessionUser.mockResolvedValue(sampleUser)
    })

    it('outputs essential user fields as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'user', '--json'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.id).toBe(42)
        expect(jsonOutput.name).toBe('Jane Smith')
        expect(jsonOutput.email).toBe('jane@example.com')
        expect(jsonOutput.timezone).toBe('America/New_York')
        expect(jsonOutput).not.toHaveProperty('lang')
        expect(jsonOutput).not.toHaveProperty('shortName')
    })

    it('outputs full user fields with --full', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'tw', 'user', '--json', '--full'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toHaveProperty('lang', 'en')
        expect(jsonOutput).toHaveProperty('shortName', 'Jane')
        expect(jsonOutput).toHaveProperty('defaultWorkspace', 1)
    })
})
