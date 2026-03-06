import { afterEach, describe, expect, it } from 'vitest'
import { formatJson, isAccessible } from '../../lib/output.js'

describe('formatJson essential fields', () => {
    it('includes reactions in thread essential fields', () => {
        const thread = {
            id: 1,
            title: 'Test',
            channelId: 10,
            workspaceId: 100,
            creator: 1,
            posted: '2026-01-01',
            commentCount: 0,
            isArchived: false,
            reactions: { '✅': [1] },
            extraField: 'should be excluded',
        }
        const result = JSON.parse(formatJson(thread, 'thread'))
        expect(result).toHaveProperty('reactions')
        expect(result.reactions).toEqual({ '✅': [1] })
        expect(result).not.toHaveProperty('extraField')
    })

    it('includes reactions in comment essential fields', () => {
        const comment = {
            id: 2,
            content: 'Hello',
            creator: 1,
            threadId: 1,
            posted: '2026-01-01',
            reactions: { '👍': [1, 2] },
            extraField: 'should be excluded',
        }
        const result = JSON.parse(formatJson(comment, 'comment'))
        expect(result).toHaveProperty('reactions')
        expect(result.reactions).toEqual({ '👍': [1, 2] })
        expect(result).not.toHaveProperty('extraField')
    })

    it('includes reactions in message essential fields', () => {
        const message = {
            id: 3,
            content: 'Hi',
            creator: 1,
            conversationId: 5,
            posted: '2026-01-01',
            reactions: { '🎉': [3] },
            extraField: 'should be excluded',
        }
        const result = JSON.parse(formatJson(message, 'message'))
        expect(result).toHaveProperty('reactions')
        expect(result.reactions).toEqual({ '🎉': [3] })
        expect(result).not.toHaveProperty('extraField')
    })
})

describe('isAccessible', () => {
    afterEach(() => {
        delete process.env.TW_ACCESSIBLE
        // Remove --accessible from argv if added
        const idx = process.argv.indexOf('--accessible')
        if (idx !== -1) process.argv.splice(idx, 1)
    })

    it('returns false by default', () => {
        expect(isAccessible()).toBe(false)
    })

    it('returns true when TW_ACCESSIBLE=1', () => {
        process.env.TW_ACCESSIBLE = '1'
        expect(isAccessible()).toBe(true)
    })

    it('returns false when TW_ACCESSIBLE is set to other values', () => {
        process.env.TW_ACCESSIBLE = '0'
        expect(isAccessible()).toBe(false)
        process.env.TW_ACCESSIBLE = 'true'
        expect(isAccessible()).toBe(false)
    })

    it('returns true when --accessible is in argv', () => {
        process.argv.push('--accessible')
        expect(isAccessible()).toBe(true)
    })
})
