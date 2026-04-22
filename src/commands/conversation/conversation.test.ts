import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CliError } from '../../lib/errors.js'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    getCurrentWorkspaceId: vi.fn().mockResolvedValue(1),
    getSessionUser: vi.fn().mockResolvedValue({ id: 1, name: 'Me' }),
}))

const refsMocks = vi.hoisted(() => ({
    resolveConversationId: vi.fn((ref: string) => Number(ref)),
    resolveWorkspaceRef: vi.fn(),
    resolveUserRefs: vi.fn(),
}))

vi.mock('../../lib/api.js', () => apiMocks)

vi.mock('../../lib/refs.js', () => refsMocks)

vi.mock('../../lib/markdown.js', () => ({
    renderMarkdown: vi.fn((text: string) => Promise.resolve(text)),
}))

vi.mock('chalk')

import { registerConversationCommand } from './index.js'

type TestConversation = {
    id: number
    workspaceId: number
    userIds: number[]
    title: string | null
    messageCount: number
    lastActive: Date
    archived: boolean
    created: Date
    creator: number
    lastObjIndex: number
    snippet: string
    snippetCreators: number[]
    url: string
    lastMessage: null
}

function createConversation(id: number, userIds: number[], lastActive: string): TestConversation {
    return {
        id,
        workspaceId: 1,
        userIds,
        title: null,
        messageCount: 1,
        lastActive: new Date(lastActive),
        archived: false,
        created: new Date('2026-03-01T00:00:00.000Z'),
        creator: userIds[0],
        lastObjIndex: 1,
        snippet: `Snippet ${id}`,
        snippetCreators: [userIds[0]],
        url: `https://twist.com/a/1/msg/${id}`,
        lastMessage: null,
    }
}

function createClient({
    activeConversations = [],
    archivedConversations = [],
    messagesByConversation = {},
    users = {},
}: {
    activeConversations?: TestConversation[]
    archivedConversations?: TestConversation[]
    messagesByConversation?: Record<number, Array<Record<string, unknown>>>
    users?: Record<number, { id: number; name: string }>
}) {
    const conversationsById = new Map(
        [...activeConversations, ...archivedConversations].map((conversation) => [
            conversation.id,
            conversation,
        ]),
    )

    const getPage = (
        conversations: TestConversation[],
        { limit, beforeId }: { limit?: number; beforeId?: number },
    ) => {
        const startIndex = beforeId
            ? conversations.findIndex((conversation) => conversation.id === beforeId) + 1
            : 0

        if (beforeId && startIndex === 0) {
            return []
        }

        return conversations.slice(startIndex, startIndex + (limit ?? conversations.length))
    }

    return {
        conversations: {
            getConversations: vi.fn(
                async ({
                    archived,
                    limit,
                    beforeId,
                }: {
                    archived?: boolean
                    limit?: number
                    beforeId?: number
                }) =>
                    getPage(archived ? archivedConversations : activeConversations, {
                        limit,
                        beforeId,
                    }),
            ),
            getUnread: vi.fn(),
            getConversation: vi.fn((id: number, options?: { batch?: boolean }) => {
                if (options?.batch) {
                    return { kind: 'conversation', id }
                }
                return Promise.resolve(conversationsById.get(id))
            }),
            archiveConversation: vi.fn(),
            muteConversation: vi.fn(async ({ id, minutes }: { id: number; minutes: number }) => ({
                ...conversationsById.get(id),
                mutedUntil: new Date(Date.now() + minutes * 60000),
            })),
            unmuteConversation: vi.fn(async (id: number) => ({
                ...conversationsById.get(id),
                mutedUntil: null,
            })),
        },
        conversationMessages: {
            getMessages: vi.fn(
                (
                    { conversationId, limit }: { conversationId: number; limit: number },
                    options?: { batch?: boolean },
                ) => {
                    if (options?.batch) {
                        return { kind: 'messages', conversationId, limit }
                    }
                    return Promise.resolve(messagesByConversation[conversationId] ?? [])
                },
            ),
            createMessage: vi.fn(),
        },
        workspaceUsers: {
            getUserById: vi.fn(
                (
                    { workspaceId, userId }: { workspaceId: number; userId: number },
                    options?: { batch?: boolean },
                ) => {
                    if (options?.batch) {
                        return { kind: 'user', workspaceId, userId }
                    }
                    return Promise.resolve(users[userId])
                },
            ),
        },
        batch: vi.fn(
            async (
                ...requests: Array<{
                    kind: string
                    id?: number
                    userId?: number
                    conversationId?: number
                }>
            ) =>
                requests.map((request) => {
                    if (request.kind === 'conversation' && request.id) {
                        return { data: conversationsById.get(request.id) }
                    }
                    if (request.kind === 'messages') {
                        return { data: messagesByConversation[request.conversationId ?? -1] ?? [] }
                    }
                    if (request.kind === 'user' && request.userId) {
                        return { data: users[request.userId] }
                    }
                    throw new Error(`Unexpected batch request: ${JSON.stringify(request)}`)
                }),
        ),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerConversationCommand(program)
    return program
}

describe('conversation implicit view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockRejectedValue(new Error('MOCK_API_REACHED'))
    })

    it('tw conversation <ref> routes to view (not unknown command)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await expect(program.parseAsync(['node', 'tw', 'conversation', '100'])).rejects.toThrow(
            'MOCK_API_REACHED',
        )

        consoleSpy.mockRestore()
    })
})

describe('conversation unread --workspace conflict', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'tw',
                'conversation',
                'unread',
                'Doist',
                '--workspace',
                'Other',
            ]),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})

describe('conversation with', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        refsMocks.resolveUserRefs.mockResolvedValue([2])
    })

    it('prints the exact 1:1 conversation for a user', async () => {
        const directConversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const groupConversation = createConversation(43, [1, 2, 3], '2026-03-09T10:00:00.000Z')
        const client = createClient({
            activeConversations: [directConversation, groupConversation],
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
                3: { id: 3, name: 'Bob Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'with', 'Alice'])

        expect(refsMocks.resolveUserRefs).toHaveBeenCalledWith('Alice', 1)
        expect(refsMocks.resolveConversationId).not.toHaveBeenCalled()
        expect(client.conversationMessages.getMessages).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Conversation with Me, Alice Example')
        expect(client.conversations.getConversations).toHaveBeenCalledWith({
            workspaceId: 1,
            archived: undefined,
            limit: 100,
            beforeId: undefined,
        })
        expect(client.conversations.getConversations).not.toHaveBeenCalledWith(
            expect.objectContaining({ archived: true }),
        )

        consoleSpy.mockRestore()
    })

    it('pages through older conversations to find a 1:1 DM', async () => {
        const recentGroups = Array.from({ length: 100 }, (_, index) =>
            createConversation(2000 - index, [1, 3], '2026-03-08T10:00:00.000Z'),
        )
        const directConversation = createConversation(42, [1, 2], '2024-05-31T12:52:09.000Z')
        const client = createClient({
            activeConversations: [...recentGroups, directConversation],
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
                3: { id: 3, name: 'Bob Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'with', 'Alice'])

        expect(client.conversations.getConversations).toHaveBeenCalledWith({
            workspaceId: 1,
            limit: 100,
        })
        expect(client.conversations.getConversations).toHaveBeenCalledWith({
            workspaceId: 1,
            limit: 100,
            beforeId: 1901,
        })
        expect(refsMocks.resolveConversationId).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('checks archived conversations only after active pages miss', async () => {
        const archivedConversation = createConversation(42, [1, 2], '2024-05-31T12:52:09.000Z')
        const client = createClient({
            activeConversations: [createConversation(43, [1, 3], '2026-03-08T10:00:00.000Z')],
            archivedConversations: [archivedConversation],
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
                3: { id: 3, name: 'Bob Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'with', 'Alice'])

        expect(client.conversations.getConversations).toHaveBeenNthCalledWith(1, {
            workspaceId: 1,
            archived: undefined,
            limit: 100,
            beforeId: undefined,
        })
        expect(client.conversations.getConversations).toHaveBeenNthCalledWith(2, {
            workspaceId: 1,
            archived: undefined,
            limit: 100,
            beforeId: 43,
        })
        expect(client.conversations.getConversations).toHaveBeenNthCalledWith(3, {
            workspaceId: 1,
            archived: true,
            limit: 100,
            beforeId: undefined,
        })

        consoleSpy.mockRestore()
    })

    it('lists matching group conversations when --include-groups is set', async () => {
        const directConversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const groupConversation = createConversation(43, [1, 2, 3], '2026-03-09T10:00:00.000Z')
        const client = createClient({
            activeConversations: [directConversation, groupConversation],
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
                3: { id: 3, name: 'Bob Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'tw',
            'conversation',
            'with',
            'Alice',
            '--include-groups',
            '--json',
        ])

        expect(refsMocks.resolveConversationId).not.toHaveBeenCalled()
        expect(
            JSON.parse(consoleSpy.mock.calls[0][0]).map(
                (conversation: { id: number }) => conversation.id,
            ),
        ).toEqual([43, 42])

        consoleSpy.mockRestore()
    })

    it('finds the self-conversation when looking up yourself', async () => {
        refsMocks.resolveUserRefs.mockResolvedValue([1])
        const selfConversation = createConversation(10, [1], '2026-03-10T10:00:00.000Z')
        const client = createClient({
            activeConversations: [selfConversation],
            users: { 1: { id: 1, name: 'Me' } },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'with', 'Me'])

        expect(consoleSpy).toHaveBeenCalledWith('Conversation with Me')

        consoleSpy.mockRestore()
    })

    it('emits empty JSON array when no 1:1 conversation is found with --json', async () => {
        const client = createClient({
            activeConversations: [],
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'with', 'Alice', '--json'])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(JSON.parse(consoleSpy.mock.calls[0][0])).toEqual([])

        consoleSpy.mockRestore()
    })

    it('prints a clean error and exits non-zero for ambiguous user refs', async () => {
        refsMocks.resolveUserRefs.mockRejectedValue(
            new CliError(
                'AMBIGUOUS_USER',
                'Multiple users match "Alex":\n  1  Alex <alex@example.com>\n\nUse numeric ID to specify.',
            ),
        )

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'conversation', 'with', 'Alex']),
        ).rejects.toHaveProperty('code', 'AMBIGUOUS_USER')
    })
})

describe('conversation view machine output', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('filters conversation and message fields unless --full is set', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({
            activeConversations: [conversation],
            messagesByConversation: {
                42: [
                    {
                        id: 99,
                        content: '**hello**',
                        creator: 2,
                        conversationId: 42,
                        posted: new Date('2026-03-08T10:05:00.000Z'),
                        reactions: [],
                        extra: 'message-extra',
                    },
                ],
            },
            users: {
                1: { id: 1, name: 'Me' },
                2: { id: 2, name: 'Alice Example' },
            },
        })

        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'view', '42', '--json'])

        const jsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(jsonOutput.conversation).toEqual({
            id: 42,
            workspaceId: 1,
            userIds: [1, 2],
            title: null,
            messageCount: 1,
            lastActive: '2026-03-08T10:00:00.000Z',
            archived: false,
        })
        expect(jsonOutput.messages).toEqual([
            {
                id: 99,
                content: '**hello**',
                creator: 2,
                conversationId: 42,
                posted: '2026-03-08T10:05:00.000Z',
                reactions: [],
            },
        ])

        consoleSpy.mockClear()

        await program.parseAsync(['node', 'tw', 'conversation', 'view', '42', '--ndjson'])

        expect(consoleSpy.mock.calls.map((call) => JSON.parse(call[0]))).toEqual([
            {
                type: 'conversation',
                id: 42,
                workspaceId: 1,
                userIds: [1, 2],
                title: null,
                messageCount: 1,
                lastActive: '2026-03-08T10:00:00.000Z',
                archived: false,
            },
            {
                type: 'message',
                id: 99,
                content: '**hello**',
                creator: 2,
                conversationId: 42,
                posted: '2026-03-08T10:05:00.000Z',
                reactions: [],
            },
        ])

        consoleSpy.mockClear()

        await program.parseAsync(['node', 'tw', 'conversation', 'view', '42', '--json', '--full'])

        const fullJsonOutput = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(fullJsonOutput.conversation.participantNames).toEqual(['Me', 'Alice Example'])
        expect(fullJsonOutput.messages[0].creatorName).toBe('Alice Example')
        expect(fullJsonOutput.messages[0].extra).toBe('message-extra')

        consoleSpy.mockRestore()
    })
})

describe('conversation mute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('mutes a conversation with default 60 minutes', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'mute', '42'])

        expect(client.conversations.muteConversation).toHaveBeenCalledWith({ id: 42, minutes: 60 })
        expect(consoleSpy).toHaveBeenCalledWith('Conversation 42 muted for 60 minutes.')

        consoleSpy.mockRestore()
    })

    it('mutes a conversation with custom minutes', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'mute', '42', '--minutes', '480'])

        expect(client.conversations.muteConversation).toHaveBeenCalledWith({
            id: 42,
            minutes: 480,
        })
        expect(consoleSpy).toHaveBeenCalledWith('Conversation 42 muted for 480 minutes.')

        consoleSpy.mockRestore()
    })

    it('shows dry run output', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'mute', '42', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would mute conversation'))
        expect(consoleSpy).toHaveBeenCalledWith('  Conversation: conversation 42')
        expect(consoleSpy).toHaveBeenCalledWith('  Duration: 60 minutes')
        expect(client.conversations.muteConversation).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient({ activeConversations: [] })
        client.conversations.getConversation.mockRejectedValueOnce(
            new Error('conversation not found'),
        )
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'conversation', 'mute', '42', '--dry-run']),
        ).rejects.toThrow('conversation not found')
        expect(client.conversations.muteConversation).not.toHaveBeenCalled()
    })

    it('rejects non-integer --minutes value', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'conversation', 'mute', '42', '--minutes', 'foo']),
        ).rejects.toHaveProperty('code', 'INVALID_MINUTES')
    })
})

describe('conversation unmute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('unmutes a conversation', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'unmute', '42'])

        expect(client.conversations.unmuteConversation).toHaveBeenCalledWith(42)
        expect(consoleSpy).toHaveBeenCalledWith('Conversation 42 unmuted.')

        consoleSpy.mockRestore()
    })

    it('shows dry run output', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'unmute', '42', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would unmute conversation'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('  Conversation: conversation 42')
        expect(client.conversations.unmuteConversation).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient({ activeConversations: [] })
        client.conversations.getConversation.mockRejectedValueOnce(
            new Error('conversation not found'),
        )
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'conversation', 'unmute', '42', '--dry-run']),
        ).rejects.toThrow('conversation not found')
        expect(client.conversations.unmuteConversation).not.toHaveBeenCalled()
    })
})

describe('conversation done', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('archives a conversation', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'done', '42'])

        expect(client.conversations.archiveConversation).toHaveBeenCalledWith(42)
        expect(consoleSpy).toHaveBeenCalledWith('Conversation 42 archived.')

        consoleSpy.mockRestore()
    })

    it('shows dry run output', async () => {
        const conversation = createConversation(42, [1, 2], '2026-03-08T10:00:00.000Z')
        const client = createClient({ activeConversations: [conversation] })
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'tw', 'conversation', 'done', '42', '--dry-run'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would archive conversation'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('  Conversation: conversation 42')
        expect(client.conversations.archiveConversation).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('runs validation in dry-run mode', async () => {
        const client = createClient({ activeConversations: [] })
        client.conversations.getConversation.mockRejectedValueOnce(
            new Error('conversation not found'),
        )
        apiMocks.getTwistClient.mockResolvedValue(client)

        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'tw', 'conversation', 'done', '42', '--dry-run']),
        ).rejects.toThrow('conversation not found')
        expect(client.conversations.archiveConversation).not.toHaveBeenCalled()
    })
})
