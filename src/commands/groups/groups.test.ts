import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockBatch = vi.fn()
const mockGetUserById = vi.fn()

const apiMocks = vi.hoisted(() => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getWorkspaceGroups: vi.fn(),
    getWorkspaceUsers: vi.fn(),
    getTwistClient: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    addUsersToGroup: vi.fn(),
    removeUsersFromGroup: vi.fn(),
}))

vi.mock('../../lib/api.js', () => apiMocks)

const refsMocks = vi.hoisted(() => ({
    resolveWorkspaceRef: vi.fn(),
    resolveUserRefs: vi.fn(),
    resolveGroupRef: vi.fn(),
}))

vi.mock('../../lib/refs.js', () => refsMocks)

vi.mock('chalk')

import { registerGroupsCommand } from './index.js'

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

const frontend = sampleGroups[0]

beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
    apiMocks.getWorkspaceGroups.mockResolvedValue(sampleGroups)
    apiMocks.getTwistClient.mockResolvedValue({
        workspaceUsers: { getUserById: mockGetUserById },
        batch: mockBatch,
    })
})

describe('tw groups list (default)', () => {
    it('lists all groups', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups'])

        expect(consoleSpy).toHaveBeenCalledTimes(3)
        expect(consoleSpy.mock.calls[0][0]).toContain('Frontend')
    })

    it('outputs JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toHaveLength(3)
        expect(output[0].id).toBe(100)
    })

    it('still works with explicit list subcommand', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'list'])

        expect(consoleSpy).toHaveBeenCalledTimes(3)
    })

    it('filters groups with --search', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--search', 'front'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('Frontend')
    })

    it('shows empty message when no groups match', async () => {
        apiMocks.getWorkspaceGroups.mockResolvedValue([])
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('No groups')
    })

    it('outputs NDJSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--ndjson'])

        // NDJSON emits all lines via formatNdjson in a single console.log call
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const lines = consoleSpy.mock.calls[0][0].split('\n').filter(Boolean)
        expect(lines).toHaveLength(3)
        expect(JSON.parse(lines[0]).id).toBe(100)
    })

    it('includes all fields with --json --full', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', '--json', '--full'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output[0]).toHaveProperty('description')
        expect(output[0]).toHaveProperty('version')
    })

    it('accepts [workspace-ref] positional argument', async () => {
        refsMocks.resolveWorkspaceRef.mockResolvedValue({ id: 1, name: 'Test' })
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'list', '1'])

        expect(refsMocks.resolveWorkspaceRef).toHaveBeenCalledWith('1')
        expect(consoleSpy).toHaveBeenCalled()
    })
})

describe('tw groups view', () => {
    const batchUserResponses = [
        { code: 200, data: { id: 1, name: 'Alice', email: 'a@d.com' } },
        { code: 200, data: { id: 2, name: 'Bob', email: 'b@d.com' } },
        { code: 200, data: { id: 3, name: 'Carol', email: 'c@d.com' } },
    ]

    beforeEach(() => {
        refsMocks.resolveGroupRef.mockResolvedValue(frontend)
        mockBatch.mockResolvedValue(batchUserResponses)
    })

    it('resolves group ref and batch-fetches only group members', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'view', 'Frontend'])

        expect(refsMocks.resolveGroupRef).toHaveBeenCalledWith('Frontend', 1)
        // Should batch-fetch users, not load all workspace users
        expect(mockBatch).toHaveBeenCalled()
        expect(apiMocks.getWorkspaceUsers).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(text).toContain('Alice')
        expect(text).toContain('Bob')
    })

    it('outputs JSON with enriched members (default shape)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'view', 'id:100', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.id).toBe(100)
        expect(output.name).toBe('Frontend')
        expect(output.members).toHaveLength(3)
        expect(output.members[0]).toMatchObject({ id: 1, name: 'Alice', email: 'a@d.com' })
        // Default shape should not include raw SDK fields like description, version
        expect(output).not.toHaveProperty('description')
        expect(output).not.toHaveProperty('version')
    })

    it('outputs JSON with all fields when --full', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'view', 'id:100', '--json', '--full'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.id).toBe(100)
        expect(output.members).toHaveLength(3)
        // Full shape includes everything
        expect(output).toHaveProperty('description')
    })
})

describe('tw groups create', () => {
    beforeEach(() => {
        apiMocks.createGroup.mockResolvedValue({ ...frontend, id: 999, name: 'Design' })
    })

    it('creates a group without users', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'create', 'Design'])

        expect(apiMocks.createGroup).toHaveBeenCalledWith({
            workspaceId: 1,
            name: 'Design',
            userIds: undefined,
        })
        expect(consoleSpy.mock.calls[0][0]).toContain('Design')
    })

    it('resolves --users and passes ids to createGroup', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([10, 20])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'create',
            'Design',
            '--users',
            'a@d.com,b@d.com',
        ])

        expect(refsMocks.resolveUserRefs).toHaveBeenCalledWith('a@d.com,b@d.com', 1)
        expect(apiMocks.createGroup).toHaveBeenCalledWith({
            workspaceId: 1,
            name: 'Design',
            userIds: [10, 20],
        })
    })

    it('rejects empty name', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'groups', 'create', '   ']),
        ).rejects.toMatchObject({ code: 'INVALID_NAME' })
    })
})

describe('tw groups rename', () => {
    beforeEach(() => {
        refsMocks.resolveGroupRef.mockResolvedValue(frontend)
        apiMocks.updateGroup.mockResolvedValue({ ...frontend, name: 'FE Team' })
    })

    it('renames an existing group', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'rename', 'Frontend', 'FE Team'])

        expect(apiMocks.updateGroup).toHaveBeenCalledWith({ id: 100, name: 'FE Team' })
        expect(consoleSpy.mock.calls[0][0]).toContain('FE Team')
    })
})

describe('tw groups delete', () => {
    beforeEach(() => {
        refsMocks.resolveGroupRef.mockResolvedValue(frontend)
    })

    it('refuses to delete without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'delete', 'Frontend'])

        expect(apiMocks.deleteGroup).not.toHaveBeenCalled()
        expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('Use --yes'))).toBe(true)
    })

    it('deletes when --yes is passed', async () => {
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'delete', 'Frontend', '--yes'])

        expect(apiMocks.deleteGroup).toHaveBeenCalledWith(100)
    })

    it('errors in --json mode without --yes', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'groups', 'delete', 'Frontend', '--json']),
        ).rejects.toMatchObject({ code: 'MISSING_YES_FLAG' })
    })
})

describe('tw groups add-user', () => {
    beforeEach(() => {
        refsMocks.resolveGroupRef.mockResolvedValue({ ...frontend, userIds: [1, 2] })
    })

    it('joins variadic refs and resolves them', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([3, 4])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'add-user',
            'Frontend',
            'carol@d.com',
            'dave@d.com',
        ])

        expect(refsMocks.resolveUserRefs).toHaveBeenCalledWith('carol@d.com,dave@d.com', 1)
        expect(apiMocks.addUsersToGroup).toHaveBeenCalledWith(100, [3, 4])
    })

    it('mixes comma- and space-separated refs', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([3, 4, 5])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'add-user',
            'id:100',
            'a@d.com,b@d.com',
            'c@d.com',
        ])

        expect(refsMocks.resolveUserRefs).toHaveBeenCalledWith('a@d.com,b@d.com,c@d.com', 1)
    })

    it('skips users already in the group', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([1, 3])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'add-user', 'Frontend', 'id:1,id:3'])

        expect(apiMocks.addUsersToGroup).toHaveBeenCalledWith(100, [3])
    })

    it('makes no API call when all users are already members', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([1, 2])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'groups', 'add-user', 'Frontend', 'id:1,id:2'])

        expect(apiMocks.addUsersToGroup).not.toHaveBeenCalled()
    })

    it('errors when no user refs given', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'groups', 'add-user', 'Frontend']),
        ).rejects.toMatchObject({ code: 'MISSING_USERS' })
    })

    it('deduplicates resolved user IDs', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([3, 3, 4])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'add-user',
            'Frontend',
            'id:3,id:3',
            'id:4',
        ])

        // Should deduplicate before calling the API
        expect(apiMocks.addUsersToGroup).toHaveBeenCalledWith(100, [3, 4])
    })
})

describe('tw groups remove-user', () => {
    beforeEach(() => {
        refsMocks.resolveGroupRef.mockResolvedValue({ ...frontend, userIds: [1, 2, 3] })
    })

    it('only removes users that are members', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([2, 3, 99])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'remove-user',
            'Frontend',
            'id:2,id:3,id:99',
        ])

        expect(apiMocks.removeUsersFromGroup).toHaveBeenCalledWith(100, [2, 3])
    })

    it('makes no API call when none of the users are members', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([99, 100])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'remove-user',
            'Frontend',
            'id:99,id:100',
        ])

        expect(apiMocks.removeUsersFromGroup).not.toHaveBeenCalled()
    })

    it('errors when no user refs given', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'groups', 'remove-user', 'Frontend']),
        ).rejects.toMatchObject({ code: 'MISSING_USERS' })
    })

    it('deduplicates resolved user IDs', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([2, 2, 3])
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'groups',
            'remove-user',
            'Frontend',
            'id:2,id:2',
            'id:3',
        ])

        // Should deduplicate before calling the API
        expect(apiMocks.removeUsersFromGroup).toHaveBeenCalledWith(100, [2, 3])
    })
})
