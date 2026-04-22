import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refsMocks = vi.hoisted(() => ({
    resolveWorkspaceRef: vi.fn(),
    resolveUserRefs: vi.fn(),
    resolveChannelId: vi.fn(),
    resolveConversationId: vi.fn(),
}))

const searchApiMocks = vi.hoisted(() => ({
    extendedSearch: vi.fn(),
}))

vi.mock('../lib/api.js', () => ({
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
}))

vi.mock('../lib/refs.js', () => refsMocks)

vi.mock('../lib/global-args.js', async (importOriginal) => ({
    ...(await importOriginal()),
    includePrivateChannels: vi.fn().mockReturnValue(true),
}))

vi.mock('../lib/public-channels.js', () => ({
    getPublicChannelIds: vi.fn(),
}))

vi.mock('../lib/search-api.js', () => searchApiMocks)

vi.mock('chalk')

import { registerSearchCommand } from './search.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSearchCommand(program)
    return program
}

describe('search --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        refsMocks.resolveWorkspaceRef.mockResolvedValue({ id: 1, name: 'Doist' })
        searchApiMocks.extendedSearch.mockResolvedValue({
            items: [],
            hasMore: false,
            isPlanRestricted: false,
        })
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'search', 'query', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })

    it('parses channel and conversation refs using resolvers', async () => {
        refsMocks.resolveChannelId.mockImplementation((ref: string) => {
            if (ref === 'id:10') return 10
            if (ref === 'https://twist.com/a/1/ch/20') return 20
            throw new Error('Unexpected channel ref')
        })
        refsMocks.resolveConversationId.mockImplementation((ref: string) => {
            if (ref === 'id:30') return 30
            if (ref === 'https://twist.com/a/1/msg/40') return 40
            throw new Error('Unexpected conversation ref')
        })

        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        await program.parseAsync([
            'node',
            'tw',
            'search',
            'query',
            '--channel',
            'id:10,https://twist.com/a/1/ch/20',
            '--conversation',
            'id:30,https://twist.com/a/1/msg/40',
        ])

        expect(searchApiMocks.extendedSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                channelIds: [10, 20],
                conversationIds: [30, 40],
            }),
        )

        logSpy.mockRestore()
    })
})
