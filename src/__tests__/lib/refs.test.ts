import { describe, expect, it } from 'vitest'
import {
    extractId,
    isIdRef,
    parseRef,
    parseTwistUrl,
    resolveCommentId,
    resolveConversationId,
    resolveMessageId,
    resolveThreadId,
} from '../../lib/refs.js'

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

    it('throws on invalid input', () => {
        expect(() => extractId('invalid')).toThrow('Invalid ID')
        expect(() => extractId('id:abc')).toThrow('Invalid ID')
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
