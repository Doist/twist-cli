import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getWorkspaceGroups: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
    getWorkspaceGroups: apiMocks.getWorkspaceGroups,
}))

vi.mock('../lib/refs.js', () => ({
    resolveWorkspaceRef: vi.fn(),
}))

vi.mock('chalk')

import { registerGroupsCommand } from './groups.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerGroupsCommand(program)
    return program
}

const sampleGroups = [
    {
        id: 100,
        name: 'Frontend',
        description: 'Frontend team',
        workspaceId: 1,
        userIds: [1, 2, 3],
        version: 1,
    },
    { id: 200, name: 'Backend', description: null, workspaceId: 1, userIds: [4, 5], version: 1 },
    {
        id: 300,
        name: 'Full Stack',
        description: 'Cross-team',
        workspaceId: 1,
        userIds: [1, 4],
        version: 1,
    },
]

describe('groups', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getWorkspaceGroups.mockResolvedValue(sampleGroups)
    })

    it('lists all groups', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups'])

        expect(consoleSpy).toHaveBeenCalledTimes(3)
        expect(consoleSpy.mock.calls[0][0]).toContain('Frontend')
        expect(consoleSpy.mock.calls[1][0]).toContain('Backend')
        expect(consoleSpy.mock.calls[2][0]).toContain('Full Stack')

        consoleSpy.mockRestore()
    })

    it('filters groups by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--search', 'front'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('Frontend')

        consoleSpy.mockRestore()
    })

    it('shows no groups message when empty', async () => {
        apiMocks.getWorkspaceGroups.mockResolvedValue([])
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups'])

        expect(consoleSpy).toHaveBeenCalledWith('No groups found.')

        consoleSpy.mockRestore()
    })

    it('outputs JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toHaveLength(3)
        expect(jsonOutput[0].id).toBe(100)
        expect(jsonOutput[0].name).toBe('Frontend')

        consoleSpy.mockRestore()
    })

    it('outputs full JSON with all fields', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--json', '--full'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput[0]).toHaveProperty('description')
        expect(jsonOutput[0]).toHaveProperty('version')

        consoleSpy.mockRestore()
    })

    it('outputs NDJSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--ndjson'])

        const lines = consoleSpy.mock.calls[0][0].split('\n')
        expect(lines).toHaveLength(3)
        expect(JSON.parse(lines[0]).name).toBe('Frontend')

        consoleSpy.mockRestore()
    })
})
