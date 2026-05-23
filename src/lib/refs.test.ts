import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
    getTwistClient: vi.fn(),
    fetchWorkspaces: vi.fn(),
    getWorkspaceUsers: vi.fn(),
    getWorkspaceGroups: vi.fn(),
    getGroup: vi.fn(),
}))

vi.mock('./api.js', () => ({
    getTwistClient: apiMocks.getTwistClient,
    fetchWorkspaces: apiMocks.fetchWorkspaces,
    getWorkspaceUsers: apiMocks.getWorkspaceUsers,
    getWorkspaceGroups: apiMocks.getWorkspaceGroups,
    getGroup: apiMocks.getGroup,
}))

import {
    classifyTwistUrl,
    extractId,
    isIdRef,
    looksLikeRawId,
    parseRef,
    parseTwistUrl,
    partitionNotifyIds,
    resolveChannelId,
    resolveChannelRef,
    resolveCommentId,
    resolveConversationId,
    resolveGroupRef,
    resolveMessageId,
    resolveThreadId,
    resolveUserRefs,
} from './refs.js'

describe('isIdRef', () => {
    it('returns true for id: prefixed strings', () => {
        expect(isIdRef('id:123')).toBe(true)
        expect(isIdRef('id:456789')).toBe(true)
    })

    it('returns false for non-id refs', () => {
        expect(isIdRef('123')).toBe(false)
        expect(isIdRef('workspace-name')).toBe(false)
        expect(isIdRef('https://twist.com/a/123')).toBe(false)
    })
})

describe('extractId', () => {
    it('extracts ID from id: prefix', () => {
        expect(extractId('id:123')).toBe(123)
        expect(extractId('id:456789')).toBe(456789)
    })

    it('parses bare numbers', () => {
        expect(extractId('123')).toBe(123)
    })

    it('accepts whitespace around IDs', () => {
        expect(extractId(' 123 ')).toBe(123)
        expect(extractId('id: 456')).toBe(456)
    })

    it('throws on invalid input', () => {
        expect(() => extractId('invalid')).toThrow('Invalid ID')
        expect(() => extractId('id:abc')).toThrow('Invalid ID')
        expect(() => extractId('id:123abc')).toThrow('Invalid ID')
    })
})

describe('looksLikeRawId', () => {
    it('detects numeric strings', () => {
        expect(looksLikeRawId('123456')).toBe(true)
    })

    it('detects alphanumeric strings', () => {
        expect(looksLikeRawId('abc123')).toBe(true)
    })

    it('rejects plain names and spaces', () => {
        expect(looksLikeRawId('workspace')).toBe(false)
        expect(looksLikeRawId('workspace one')).toBe(false)
    })
})

describe('parseTwistUrl', () => {
    it('parses workspace URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345')
        expect(result).toEqual({ workspaceId: 12345 })
    })

    it('parses channel URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345/ch/67890')
        expect(result).toEqual({ workspaceId: 12345, channelId: 67890 })
    })

    it('parses thread URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345/ch/67890/t/111')
        expect(result).toEqual({ workspaceId: 12345, channelId: 67890, threadId: 111 })
    })

    it('parses thread with comment URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345/ch/67890/t/111/c/222')
        expect(result).toEqual({
            workspaceId: 12345,
            channelId: 67890,
            threadId: 111,
            commentId: 222,
        })
    })

    it('parses conversation URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345/msg/333')
        expect(result).toEqual({ workspaceId: 12345, conversationId: 333 })
    })

    it('parses message URL', () => {
        const result = parseTwistUrl('https://twist.com/a/12345/msg/333/m/444')
        expect(result).toEqual({ workspaceId: 12345, conversationId: 333, messageId: 444 })
    })

    it('returns null for non-twist URLs', () => {
        expect(parseTwistUrl('https://google.com')).toBeNull()
        expect(parseTwistUrl('https://example.com/a/123')).toBeNull()
    })

    it('returns null for invalid URLs', () => {
        expect(parseTwistUrl('not-a-url')).toBeNull()
    })
})

describe('parseRef', () => {
    it('parses id: refs', () => {
        expect(parseRef('id:123')).toEqual({ type: 'id', id: 123 })
    })

    it('parses bare numbers', () => {
        expect(parseRef('456')).toEqual({ type: 'id', id: 456 })
    })

    it('parses URLs', () => {
        const result = parseRef('https://twist.com/a/12345/ch/67890/t/111')
        expect(result).toEqual({
            type: 'url',
            parsed: { workspaceId: 12345, channelId: 67890, threadId: 111 },
        })
    })

    it('parses names', () => {
        expect(parseRef('My Workspace')).toEqual({ type: 'name', name: 'My Workspace' })
    })

    it('trims surrounding whitespace', () => {
        expect(parseRef(' 456 ')).toEqual({ type: 'id', id: 456 })
        expect(parseRef('  My Workspace  ')).toEqual({ type: 'name', name: 'My Workspace' })
    })
})

describe('resolveThreadId', () => {
    it('resolves id: refs', () => {
        expect(resolveThreadId('id:123')).toBe(123)
    })

    it('resolves bare numbers', () => {
        expect(resolveThreadId('456')).toBe(456)
    })

    it('resolves thread URLs', () => {
        expect(resolveThreadId('https://twist.com/a/12345/ch/67890/t/111')).toBe(111)
    })

    it('resolves thread URLs with comment suffix', () => {
        expect(resolveThreadId('https://twist.com/a/12345/ch/67890/t/111/c/222')).toBe(111)
    })

    it('throws on invalid refs', () => {
        expect(() => resolveThreadId('invalid-name')).toThrow('Invalid thread reference')
    })
})

describe('resolveCommentId', () => {
    it('resolves id: refs', () => {
        expect(resolveCommentId('id:222')).toBe(222)
    })

    it('resolves comment URLs', () => {
        expect(resolveCommentId('https://twist.com/a/12345/ch/67890/t/111/c/222')).toBe(222)
    })
})

describe('resolveChannelId', () => {
    it('resolves id: refs', () => {
        expect(resolveChannelId('id:67890')).toBe(67890)
    })

    it('resolves channel URLs', () => {
        expect(resolveChannelId('https://twist.com/a/12345/ch/67890')).toBe(67890)
    })
})

describe('resolveChannelRef', () => {
    function createChannel(id: number, name: string, overrides: Record<string, unknown> = {}) {
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

    const mockGetChannel = vi.fn()
    const mockGetChannels = vi.fn()
    const mockGetPublicChannels = vi.fn()

    /**
     * For name refs, resolveChannelRef merges joined channels (getChannels — membership-scoped,
     * includes both active + archived) with public channels (getPublicChannels — workspace-scoped,
     * finds unjoined-but-public channels). Tests default both to empty unless overridden.
     */
    function mockChannelLists(joined: unknown[] = [], publicChannels: unknown[] = []) {
        mockGetChannels.mockResolvedValue(joined)
        mockGetPublicChannels.mockResolvedValue(publicChannels)
    }

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getTwistClient.mockResolvedValue({
            channels: {
                getChannel: mockGetChannel,
                getChannels: mockGetChannels,
            },
            workspaces: {
                getPublicChannels: mockGetPublicChannels,
            },
        })
    })

    it('fetches channel by id: ref via getChannel', async () => {
        const ch = createChannel(42, 'engineering')
        mockGetChannel.mockResolvedValue(ch)

        const result = await resolveChannelRef('id:42', 1)

        expect(mockGetChannel).toHaveBeenCalledWith(42)
        expect(mockGetChannels).not.toHaveBeenCalled()
        expect(result).toEqual(ch)
    })

    it('fetches channel by Twist URL via getChannel', async () => {
        const ch = createChannel(42, 'engineering')
        mockGetChannel.mockResolvedValue(ch)

        const result = await resolveChannelRef('https://twist.com/a/1/ch/42', 1)

        expect(mockGetChannel).toHaveBeenCalledWith(42)
        expect(result).toEqual(ch)
    })

    it('throws CHANNEL_NOT_FOUND when id: ref resolves to a channel in another workspace', async () => {
        mockGetChannel.mockResolvedValue(createChannel(42, 'engineering', { workspaceId: 2 }))

        await expect(resolveChannelRef('id:42', 1)).rejects.toHaveProperty(
            'code',
            'CHANNEL_NOT_FOUND',
        )
    })

    it('throws CHANNEL_NOT_FOUND when URL workspaceId conflicts with expected workspaceId', async () => {
        await expect(resolveChannelRef('https://twist.com/a/2/ch/42', 1)).rejects.toHaveProperty(
            'code',
            'CHANNEL_NOT_FOUND',
        )
        expect(mockGetChannel).not.toHaveBeenCalled()
    })

    it('resolves exact case-insensitive name match against joined channels', async () => {
        const ch = createChannel(10, 'General')
        mockChannelLists([ch, createChannel(20, 'Leadership')])

        const result = await resolveChannelRef('general', 1)

        expect(mockGetChannels).toHaveBeenCalledWith({ workspaceId: 1 })
        expect(mockGetPublicChannels).toHaveBeenCalledWith(1)
        expect(result).toEqual(ch)
    })

    it('resolves unique substring name match', async () => {
        const ch = createChannel(30, 'Marketing')
        mockChannelLists([createChannel(10, 'General'), ch])

        const result = await resolveChannelRef('market', 1)

        expect(result).toEqual(ch)
    })

    it('throws AMBIGUOUS_CHANNEL on multiple substring matches', async () => {
        mockChannelLists([createChannel(10, 'Engineering'), createChannel(20, 'Engineering-Ops')])

        await expect(resolveChannelRef('eng', 1)).rejects.toHaveProperty(
            'code',
            'AMBIGUOUS_CHANNEL',
        )
    })

    it('throws CHANNEL_NOT_FOUND when no match', async () => {
        mockChannelLists([createChannel(10, 'General')])

        await expect(resolveChannelRef('nope', 1)).rejects.toHaveProperty(
            'code',
            'CHANNEL_NOT_FOUND',
        )
    })

    it('resolves unjoined-but-public channel by name', async () => {
        const publicCh = createChannel(50, 'Old Public Channel')
        mockChannelLists([createChannel(10, 'General')], [publicCh])

        const result = await resolveChannelRef('Old Public Channel', 1)

        expect(result).toEqual(publicCh)
    })

    it('resolves unjoined-but-public channel by substring', async () => {
        const publicCh = createChannel(60, 'tw-cli-smoke-test-channel')
        mockChannelLists([createChannel(10, 'General')], [publicCh])

        const result = await resolveChannelRef('smoke-test', 1)

        expect(result).toEqual(publicCh)
    })

    it('deduplicates channels appearing in both joined and public lists', async () => {
        // A public channel the user has joined would appear in both. Resolution must not
        // throw AMBIGUOUS_CHANNEL just because the same channel id shows up twice.
        const joinedPublic = createChannel(70, 'Engineering', { public: true })
        mockChannelLists([joinedPublic], [joinedPublic])

        const result = await resolveChannelRef('Engineering', 1)

        expect(result).toEqual(joinedPublic)
    })

    it('throws AMBIGUOUS_CHANNEL on substring matches spanning joined and public lists', async () => {
        mockChannelLists([createChannel(10, 'Engineering')], [createChannel(20, 'Engineering-Ops')])

        await expect(resolveChannelRef('eng', 1)).rejects.toHaveProperty(
            'code',
            'AMBIGUOUS_CHANNEL',
        )
    })
})

describe('resolveConversationId', () => {
    it('resolves id: refs', () => {
        expect(resolveConversationId('id:333')).toBe(333)
    })

    it('resolves conversation URLs', () => {
        expect(resolveConversationId('https://twist.com/a/12345/msg/333')).toBe(333)
    })
})

describe('resolveMessageId', () => {
    it('resolves id: refs', () => {
        expect(resolveMessageId('id:444')).toBe(444)
    })

    it('resolves message URLs', () => {
        expect(resolveMessageId('https://twist.com/a/12345/msg/333/m/444')).toBe(444)
    })
})

describe('partitionNotifyIds', () => {
    it('separates user IDs from group IDs', () => {
        const groupIds = new Set([100, 200])
        const result = partitionNotifyIds([1, 100, 2, 200, 3], groupIds)
        expect(result.userIds).toEqual([1, 2, 3])
        expect(result.groupIds).toEqual([100, 200])
    })

    it('returns all as users when no groups match', () => {
        const groupIds = new Set([999])
        const result = partitionNotifyIds([1, 2, 3], groupIds)
        expect(result.userIds).toEqual([1, 2, 3])
        expect(result.groupIds).toEqual([])
    })

    it('returns all as groups when all match', () => {
        const groupIds = new Set([1, 2, 3])
        const result = partitionNotifyIds([1, 2, 3], groupIds)
        expect(result.userIds).toEqual([])
        expect(result.groupIds).toEqual([1, 2, 3])
    })

    it('handles empty input', () => {
        const result = partitionNotifyIds([], new Set([1]))
        expect(result.userIds).toEqual([])
        expect(result.groupIds).toEqual([])
    })
})

describe('classifyTwistUrl', () => {
    it('classifies thread URL', () => {
        expect(classifyTwistUrl('https://twist.com/a/20/ch/100/t/200')).toEqual({
            entityType: 'thread',
            url: 'https://twist.com/a/20/ch/100/t/200',
        })
    })

    it('classifies thread+comment URL as comment', () => {
        expect(classifyTwistUrl('https://twist.com/a/20/ch/100/t/200/c/300')).toEqual({
            entityType: 'comment',
            url: 'https://twist.com/a/20/ch/100/t/200/c/300',
        })
    })

    it('classifies conversation URL', () => {
        expect(classifyTwistUrl('https://twist.com/a/20/msg/400')).toEqual({
            entityType: 'conversation',
            url: 'https://twist.com/a/20/msg/400',
        })
    })

    it('classifies message URL', () => {
        expect(classifyTwistUrl('https://twist.com/a/20/msg/400/m/500')).toEqual({
            entityType: 'message',
            url: 'https://twist.com/a/20/msg/400/m/500',
        })
    })

    it('returns null for workspace-only URL', () => {
        expect(classifyTwistUrl('https://twist.com/a/20')).toBeNull()
    })

    it('returns null for channel-only URL', () => {
        expect(classifyTwistUrl('https://twist.com/a/20/ch/100')).toBeNull()
    })

    it('returns null for non-Twist URL', () => {
        expect(classifyTwistUrl('https://google.com/a/20/t/200')).toBeNull()
    })

    it('returns null for invalid string', () => {
        expect(classifyTwistUrl('not-a-url')).toBeNull()
    })
})

describe('resolveGroupRef', () => {
    const sampleGroups = [
        { id: 100, name: 'Frontend', workspaceId: 1, userIds: [1, 2], description: '', version: 1 },
        { id: 200, name: 'Backend', workspaceId: 1, userIds: [3], description: '', version: 1 },
        {
            id: 300,
            name: 'Frontend Leads',
            workspaceId: 1,
            userIds: [1],
            description: '',
            version: 1,
        },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getWorkspaceGroups.mockResolvedValue(sampleGroups)
        apiMocks.getGroup.mockImplementation(async (id: number) => {
            const group = sampleGroups.find((g) => g.id === id)
            if (!group) throw new Error(`Group ${id} not found`)
            return group
        })
    })

    it('resolves by numeric ID via getGroup', async () => {
        const group = await resolveGroupRef('100', 1)
        expect(group.id).toBe(100)
        expect(group.name).toBe('Frontend')
        // Should use getGroup, not getWorkspaceGroups
        expect(apiMocks.getGroup).toHaveBeenCalledWith(100)
        expect(apiMocks.getWorkspaceGroups).not.toHaveBeenCalled()
    })

    it('resolves by id: prefix via getGroup', async () => {
        const group = await resolveGroupRef('id:200', 1)
        expect(group.id).toBe(200)
        expect(apiMocks.getGroup).toHaveBeenCalledWith(200)
    })

    it('throws GROUP_NOT_FOUND for missing ID', async () => {
        apiMocks.getGroup.mockRejectedValue(new Error('Not found'))
        await expect(resolveGroupRef('id:999', 1)).rejects.toMatchObject({
            code: 'GROUP_NOT_FOUND',
        })
    })

    it('throws GROUP_NOT_FOUND when group belongs to different workspace', async () => {
        apiMocks.getGroup.mockResolvedValue({ ...sampleGroups[0], workspaceId: 999 })
        await expect(resolveGroupRef('id:100', 1)).rejects.toMatchObject({
            code: 'GROUP_NOT_FOUND',
        })
    })

    it('resolves by exact name (case-insensitive)', async () => {
        const group = await resolveGroupRef('frontend', 1)
        expect(group.id).toBe(100)
    })

    it('resolves by unique name substring', async () => {
        const group = await resolveGroupRef('Back', 1)
        expect(group.id).toBe(200)
    })

    it('throws AMBIGUOUS_GROUP when name matches multiple groups', async () => {
        await expect(resolveGroupRef('Front', 1)).rejects.toMatchObject({
            code: 'AMBIGUOUS_GROUP',
        })
    })

    it('throws GROUP_NOT_FOUND when name matches nothing', async () => {
        await expect(resolveGroupRef('Marketing', 1)).rejects.toMatchObject({
            code: 'GROUP_NOT_FOUND',
        })
    })
})

describe('resolveUserRefs', () => {
    const sampleUsers = [
        { id: 1, name: 'Alice Smith', email: 'alice@doist.com' },
        { id: 2, name: 'Bob Jones', email: 'bob@doist.com' },
        { id: 3, name: 'Carol Smith', email: 'carol@doist.com' },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        apiMocks.getWorkspaceUsers.mockResolvedValue(sampleUsers)
    })

    it('resolves a single id: ref', async () => {
        const ids = await resolveUserRefs('id:42', 1)
        expect(ids).toEqual([42])
    })

    it('resolves comma-separated mixed refs', async () => {
        const ids = await resolveUserRefs('id:1, bob@doist.com', 1)
        expect(ids).toEqual([1, 2])
    })

    it('throws AMBIGUOUS_USER when name matches multiple', async () => {
        await expect(resolveUserRefs('Smith', 1)).rejects.toMatchObject({
            code: 'AMBIGUOUS_USER',
        })
    })

    it('throws USER_NOT_FOUND for unknown name', async () => {
        await expect(resolveUserRefs('nobody', 1)).rejects.toMatchObject({
            code: 'USER_NOT_FOUND',
        })
    })
})
