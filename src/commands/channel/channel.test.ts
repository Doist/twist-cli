import {
    captureConsole,
    createTestProgram,
    describeEmptyMachineOutput,
} from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    createChannel: vi.fn(),
    deleteChannel: vi.fn(),
    archiveChannel: vi.fn(),
    unarchiveChannel: vi.fn(),
}))

const refsMocks = vi.hoisted(() => ({
    resolveWorkspaceRef: vi.fn(),
    resolveChannelRef: vi.fn(),
}))

const globalArgsMocks = vi.hoisted(() => ({
    includePrivateChannels: vi.fn().mockReturnValue(false),
    isAccessible: vi.fn().mockReturnValue(false),
}))

vi.mock('../../lib/api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
    getCurrentWorkspaceId: apiMocks.getCurrentWorkspaceId,
    createChannel: apiMocks.createChannel,
    deleteChannel: apiMocks.deleteChannel,
    archiveChannel: apiMocks.archiveChannel,
    unarchiveChannel: apiMocks.unarchiveChannel,
}))

vi.mock('../../lib/refs.js', () => ({
    resolveWorkspaceRef: refsMocks.resolveWorkspaceRef,
    resolveChannelRef: refsMocks.resolveChannelRef,
}))

vi.mock('../../lib/global-args.js', () => ({
    includePrivateChannels: globalArgsMocks.includePrivateChannels,
    isAccessible: globalArgsMocks.isAccessible,
}))

vi.mock('chalk')

import { registerChannelCommand } from './index.js'

const createProgram = () => createTestProgram(registerChannelCommand)

function createChannel(id: number, name: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id,
        name,
        public: true,
        workspaceId: 1,
        archived: false,
        creator: 1,
        created: new Date('2026-01-01T00:00:00Z'),
        version: 1,
        ...overrides,
    }
}

function createClient({
    joinedChannels = [],
    publicChannels = [],
}: {
    joinedChannels?: ReturnType<typeof createChannel>[]
    publicChannels?: ReturnType<typeof createChannel>[]
} = {}) {
    return {
        channels: {
            getChannels: vi.fn().mockResolvedValue(joinedChannels),
        },
        workspaces: {
            getPublicChannels: vi.fn().mockResolvedValue(publicChannels),
        },
    }
}

describe('channels list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        globalArgsMocks.includePrivateChannels.mockReturnValue(false)
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channels', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })

    it('lists joined public channels by default (via channels alias)', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(20, 'Leadership', { public: false }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
        expect(client.workspaces.getPublicChannels).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('General')
        expect(consoleSpy.mock.calls[0][0]).not.toContain('Leadership')
    })

    it('also works via the singular channel command name', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
        expect(consoleSpy.mock.calls[0][0]).toContain('General')
    })

    it('supports explicit channel list subcommand', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'list'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
    })

    it('includes joined private channels when --include-private-channels is enabled', async () => {
        globalArgsMocks.includePrivateChannels.mockReturnValue(true)
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(20, 'Leadership', { public: false }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels'])

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
        expect(consoleSpy.mock.calls[1][0]).toContain('Leadership')
        expect(consoleSpy.mock.calls[1][0]).toContain('[private]')
    })

    it('lists active public channels and marks whether they are joined', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(20, 'Leadership', { public: false }),
            ],
            publicChannels: [
                createChannel(10, 'General'),
                createChannel(30, 'Marketing'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--scope', 'public'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({ workspaceId: 1 })
        expect(client.workspaces.getPublicChannels).toHaveBeenCalledWith(1)
        expect(consoleSpy).toHaveBeenCalledTimes(2)
        expect(consoleSpy.mock.calls[0][0]).toContain('General')
        expect(consoleSpy.mock.calls[0][0]).toContain('[joined]')
        expect(consoleSpy.mock.calls[1][0]).toContain('Marketing')
        expect(consoleSpy.mock.calls[1][0]).toContain('[not joined]')
        expect(consoleSpy.mock.calls[0][0]).not.toContain('Archive')
    })

    it('lists only discoverable channels in JSON mode', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [createChannel(10, 'General'), createChannel(30, 'Marketing')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--scope', 'discoverable', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual([
            { id: 30, name: 'Marketing', workspaceId: 1, archived: false, joined: false },
        ])
    })

    it('lists archived joined channels with --state archived', async () => {
        const client = createClient({
            joinedChannels: [createChannel(90, 'Old General', { archived: true })],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'archived'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({ workspaceId: 1, archived: true })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('Old General')
        expect(consoleSpy.mock.calls[0][0]).toContain('(archived)')
    })

    it('lists all visible public channels with --scope public --state all', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [
                createChannel(10, 'General'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channels',
            '--scope',
            'public',
            '--state',
            'all',
            '--json',
        ])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual([
            { id: 10, name: 'General', workspaceId: 1, archived: false, joined: true },
            { id: 40, name: 'Archive', workspaceId: 1, archived: true, joined: false },
        ])
    })

    it('includes archived state in joined JSON output without --full', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'all', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual([
            { id: 10, name: 'General', workspaceId: 1, archived: false },
            { id: 40, name: 'Archive', workspaceId: 1, archived: true },
        ])
    })

    it('includes archived state in joined NDJSON output without --full', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'all', '--ndjson'])

        const ndjsonOutput = consoleSpy.mock.calls[0][0]
            .split('\n')
            .map((line: string) => JSON.parse(line) as Record<string, unknown>)
        expect(ndjsonOutput).toEqual([
            { id: 10, name: 'General', workspaceId: 1, archived: false },
            { id: 40, name: 'Archive', workspaceId: 1, archived: true },
        ])
    })

    it('includes joined metadata in full JSON for public scope', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [createChannel(10, 'General', { description: 'Everyone' })],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync([
            'node',
            'tw',
            'channels',
            '--scope',
            'public',
            '--json',
            '--full',
        ])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput[0]).toMatchObject({
            id: 10,
            name: 'General',
            description: 'Everyone',
            joined: true,
        })
    })

    describeEmptyMachineOutput('empty machine output contract', {
        setup: () => {
            const client = createClient({ joinedChannels: [] })
            apiMocks.getTwistClient.mockResolvedValue(client)
        },
        run: async (extraArgs) => {
            const program = createProgram()
            await program.parseAsync(['node', 'tw', 'channels', ...extraArgs])
        },
        humanMessage: 'No active channels found.',
    })

    it('shows a specific empty state when no active discoverable channels remain', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [
                createChannel(10, 'General'),
                createChannel(20, 'Old Team', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = captureConsole()
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--scope', 'discoverable'])

        expect(consoleSpy).toHaveBeenCalledWith('No active discoverable channels found.')
    })

    it('rejects invalid scope values', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channels', '--scope', 'invalid']),
        ).rejects.toHaveProperty('code', 'INVALID_SCOPE')
    })

    it('rejects invalid state values', async () => {
        const client = createClient()
        apiMocks.getTwistClient.mockResolvedValue(client)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channels', '--state', 'invalid']),
        ).rejects.toHaveProperty('code', 'INVALID_STATE')
    })
})

describe('tw channel create', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        apiMocks.createChannel.mockResolvedValue(createChannel(999, 'Engineering'))
    })

    it('creates a public channel by default in the current workspace', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'create', 'Engineering'])

        expect(apiMocks.createChannel).toHaveBeenCalledWith({
            workspaceId: 1,
            name: 'Engineering',
            description: undefined,
            public: true,
        })
        expect(consoleSpy.mock.calls[0][0]).toContain('Engineering')
        expect(consoleSpy.mock.calls[0][0]).toContain('public')

        consoleSpy.mockRestore()
    })

    it('resolves --workspace ref when provided', async () => {
        refsMocks.resolveWorkspaceRef.mockResolvedValue({ id: 42, name: 'Other' })
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'create',
            'Engineering',
            '--workspace',
            'Other',
        ])

        expect(refsMocks.resolveWorkspaceRef).toHaveBeenCalledWith('Other')
        expect(apiMocks.createChannel).toHaveBeenCalledWith({
            workspaceId: 42,
            name: 'Engineering',
            description: undefined,
            public: true,
        })
    })

    it('passes --description and --private through to createChannel', async () => {
        apiMocks.createChannel.mockResolvedValue(
            createChannel(999, 'Leadership', { public: false, description: 'Internal' }),
        )
        const program = createProgram()
        vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'create',
            'Leadership',
            '--private',
            '--description',
            'Internal',
        ])

        expect(apiMocks.createChannel).toHaveBeenCalledWith({
            workspaceId: 1,
            name: 'Leadership',
            description: 'Internal',
            public: false,
        })
    })

    it('does not call the API on --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'create',
            'Engineering',
            '--private',
            '--dry-run',
        ])

        expect(apiMocks.createChannel).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(text).toContain('create channel')
        expect(text).toContain('private')

        consoleSpy.mockRestore()
    })

    it('outputs created channel as JSON', async () => {
        apiMocks.createChannel.mockResolvedValue(createChannel(123, 'Engineering'))
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'create', 'Engineering', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output.id).toBe(123)
        expect(output.name).toBe('Engineering')

        consoleSpy.mockRestore()
    })

    it('rejects an empty name', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'channel', 'create', '   ']),
        ).rejects.toMatchObject({ code: 'INVALID_NAME' })
    })
})

describe('tw channel delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        refsMocks.resolveChannelRef.mockResolvedValue(createChannel(500, 'Engineering'))
    })

    it('refuses to delete without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'delete', 'Engineering'])

        expect(apiMocks.deleteChannel).not.toHaveBeenCalled()
        expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('Use --yes'))).toBe(true)

        consoleSpy.mockRestore()
    })

    it('deletes when --yes is passed', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'delete', 'Engineering', '--yes'])

        expect(refsMocks.resolveChannelRef).toHaveBeenCalledWith('Engineering', 1)
        expect(apiMocks.deleteChannel).toHaveBeenCalledWith(500)
        expect(consoleSpy.mock.calls[0][0]).toContain('Engineering')

        consoleSpy.mockRestore()
    })

    it('does not delete on --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'delete', 'Engineering', '--dry-run'])

        expect(apiMocks.deleteChannel).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(text).toContain('delete channel')

        consoleSpy.mockRestore()
    })

    it('errors in --json mode without --yes', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'tw', 'channel', 'delete', 'Engineering', '--json']),
        ).rejects.toMatchObject({ code: 'MISSING_YES_FLAG' })
        expect(apiMocks.deleteChannel).not.toHaveBeenCalled()
    })

    it('translates a 403 from the API into a FORBIDDEN CliError', async () => {
        const apiError = Object.assign(new Error('Request failed with status 403'), {
            httpStatusCode: 403,
            responseData: {},
        })
        apiMocks.deleteChannel.mockRejectedValueOnce(apiError)
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'channel', 'delete', 'Engineering', '--yes']),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('outputs JSON result with --yes --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'channel',
            'delete',
            'Engineering',
            '--yes',
            '--json',
        ])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toEqual({ id: 500, deleted: true })

        consoleSpy.mockRestore()
    })
})

describe('tw channel archive', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        refsMocks.resolveChannelRef.mockResolvedValue(createChannel(500, 'Engineering'))
    })

    it('archives the resolved channel', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'archive', 'Engineering'])

        expect(refsMocks.resolveChannelRef).toHaveBeenCalledWith('Engineering', 1)
        expect(apiMocks.archiveChannel).toHaveBeenCalledWith(500)
        expect(consoleSpy.mock.calls[0][0]).toContain('archived')

        consoleSpy.mockRestore()
    })

    it('does not call the API on --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'archive', 'Engineering', '--dry-run'])

        expect(apiMocks.archiveChannel).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(text).toContain('archive channel')

        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'archive', 'Engineering', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toEqual({ id: 500, archived: true })

        consoleSpy.mockRestore()
    })
})

describe('tw channel unarchive', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getCurrentWorkspaceId.mockResolvedValue(1)
        refsMocks.resolveChannelRef.mockResolvedValue(
            createChannel(500, 'Engineering', { archived: true }),
        )
    })

    it('unarchives the resolved channel', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'unarchive', 'id:500'])

        expect(refsMocks.resolveChannelRef).toHaveBeenCalledWith('id:500', 1)
        expect(apiMocks.unarchiveChannel).toHaveBeenCalledWith(500)
        expect(consoleSpy.mock.calls[0][0]).toContain('unarchived')

        consoleSpy.mockRestore()
    })

    it('does not call the API on --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'unarchive', 'id:500', '--dry-run'])

        expect(apiMocks.unarchiveChannel).not.toHaveBeenCalled()
        const text = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(text).toContain('unarchive channel')

        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'channel', 'unarchive', 'id:500', '--json'])

        const output = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(output).toEqual({ id: 500, archived: false })

        consoleSpy.mockRestore()
    })
})
