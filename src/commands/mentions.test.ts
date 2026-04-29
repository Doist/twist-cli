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

import { registerMentionsCommand } from './mentions.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerMentionsCommand(program)
    return program
}

describe('mentions', () => {
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
            program.parseAsync(['node', 'tw', 'mentions', 'Doist', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })

    it('searches using mentionSelf without a query', async () => {
        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'mentions'])

        expect(searchApiMocks.extendedSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: 1,
                mentionSelf: true,
                query: undefined,
                title: undefined,
            }),
        )

        logSpy.mockRestore()
    })

    it('fetches every page when --all is set', async () => {
        searchApiMocks.extendedSearch
            .mockResolvedValueOnce({
                items: [],
                hasMore: true,
                nextCursorMark: 'cursor-1',
                isPlanRestricted: false,
            })
            .mockResolvedValueOnce({
                items: [],
                hasMore: false,
                isPlanRestricted: false,
            })

        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'mentions', '--all'])

        expect(searchApiMocks.extendedSearch).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                mentionSelf: true,
                cursor: undefined,
            }),
        )
        expect(searchApiMocks.extendedSearch).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                mentionSelf: true,
                cursor: 'cursor-1',
            }),
        )

        logSpy.mockRestore()
    })

    it('emits an empty JSON payload when no mentions match', async () => {
        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'mentions', '--json'])

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
            results: [],
            nextCursor: null,
        })

        logSpy.mockRestore()
    })

    it('emits NDJSON metadata when no mentions match', async () => {
        const program = createProgram()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'mentions', '--ndjson'])

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
            _meta: true,
            nextCursor: null,
        })

        logSpy.mockRestore()
    })
})
