import { describeEmptyMachineOutput } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
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

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerChannelCommand(program)
    return program
}

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
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

        consoleSpy.mockRestore()
    })

    it('also works via the singular channel command name', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
        expect(consoleSpy.mock.calls[0][0]).toContain('General')

        consoleSpy.mockRestore()
    })

    it('supports explicit channel list subcommand', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channel', 'list'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })

        consoleSpy.mockRestore()
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
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels'])

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        expect(client.channels.getChannels).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: false,
        })
        expect(consoleSpy.mock.calls[1][0]).toContain('Leadership')
        expect(consoleSpy.mock.calls[1][0]).toContain('[private]')

        consoleSpy.mockRestore()
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
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

        consoleSpy.mockRestore()
    })

    it('lists only discoverable channels in JSON mode', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [createChannel(10, 'General'), createChannel(30, 'Marketing')],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--scope', 'discoverable', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual([
            { id: 30, name: 'Marketing', workspaceId: 1, archived: false, joined: false },
        ])

        consoleSpy.mockRestore()
    })

    it('lists archived joined channels with --state archived', async () => {
        const client = createClient({
            joinedChannels: [createChannel(90, 'Old General', { archived: true })],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'archived'])

        expect(client.channels.getChannels).toHaveBeenCalledWith({ workspaceId: 1, archived: true })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(consoleSpy.mock.calls[0][0]).toContain('Old General')
        expect(consoleSpy.mock.calls[0][0]).toContain('(archived)')

        consoleSpy.mockRestore()
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
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

        consoleSpy.mockRestore()
    })

    it('includes archived state in joined JSON output without --full', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'all', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput).toEqual([
            { id: 10, name: 'General', workspaceId: 1, archived: false },
            { id: 40, name: 'Archive', workspaceId: 1, archived: true },
        ])

        consoleSpy.mockRestore()
    })

    it('includes archived state in joined NDJSON output without --full', async () => {
        const client = createClient({
            joinedChannels: [
                createChannel(10, 'General'),
                createChannel(40, 'Archive', { archived: true }),
            ],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--state', 'all', '--ndjson'])

        const ndjsonOutput = consoleSpy.mock.calls[0][0]
            .split('\n')
            .map((line: string) => JSON.parse(line) as Record<string, unknown>)
        expect(ndjsonOutput).toEqual([
            { id: 10, name: 'General', workspaceId: 1, archived: false },
            { id: 40, name: 'Archive', workspaceId: 1, archived: true },
        ])

        consoleSpy.mockRestore()
    })

    it('includes joined metadata in full JSON for public scope', async () => {
        const client = createClient({
            joinedChannels: [createChannel(10, 'General')],
            publicChannels: [createChannel(10, 'General', { description: 'Everyone' })],
        })
        apiMocks.getTwistClient.mockResolvedValue(client)
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

        consoleSpy.mockRestore()
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
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const program = createProgram()

        await program.parseAsync(['node', 'tw', 'channels', '--scope', 'discoverable'])

        expect(consoleSpy).toHaveBeenCalledWith('No active discoverable channels found.')

        consoleSpy.mockRestore()
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
