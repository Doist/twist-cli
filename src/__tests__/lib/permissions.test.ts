import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', () => ({
    getAuthMetadata: vi.fn(),
}))

import { getAuthMetadata } from '../../lib/auth.js'
import {
    ensureWriteAllowed,
    isMutatingMethod,
    READ_ONLY_ERROR_MESSAGE,
} from '../../lib/permissions.js'

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

describe('permissions', () => {
    it('blocks writes in read-only mode', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authScope: 'user:read workspaces:read',
            source: 'config',
        })

        await expect(ensureWriteAllowed()).rejects.toThrow(READ_ONLY_ERROR_MESSAGE)
    })

    it('allows writes in read-write mode', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            source: 'config',
        })

        await expect(ensureWriteAllowed()).resolves.toBeUndefined()
    })

    it('allows writes when mode is unknown', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'unknown',
            source: 'env',
        })

        await expect(ensureWriteAllowed()).resolves.toBeUndefined()
    })

    it('identifies mutating methods', () => {
        // Write operations should be mutating
        expect(isMutatingMethod('comments.createComment')).toBe(true)
        expect(isMutatingMethod('comments.updateComment')).toBe(true)
        expect(isMutatingMethod('comments.deleteComment')).toBe(true)
        expect(isMutatingMethod('conversations.createConversation')).toBe(true)
        expect(isMutatingMethod('conversations.archiveConversation')).toBe(true)
        expect(isMutatingMethod('conversationMessages.createMessage')).toBe(true)
        expect(isMutatingMethod('conversationMessages.updateMessage')).toBe(true)
        expect(isMutatingMethod('conversationMessages.deleteMessage')).toBe(true)
        expect(isMutatingMethod('inbox.archiveThread')).toBe(true)
        expect(isMutatingMethod('reactions.add')).toBe(true)
        expect(isMutatingMethod('reactions.remove')).toBe(true)
    })

    it('identifies safe (read-only) methods', () => {
        expect(isMutatingMethod('users.getSessionUser')).toBe(false)
        expect(isMutatingMethod('workspaces.getWorkspaces')).toBe(false)
        expect(isMutatingMethod('threads.getThread')).toBe(false)
        expect(isMutatingMethod('threads.getUnread')).toBe(false)
        expect(isMutatingMethod('comments.getComment')).toBe(false)
        expect(isMutatingMethod('comments.getComments')).toBe(false)
        expect(isMutatingMethod('channels.getChannel')).toBe(false)
        expect(isMutatingMethod('channels.getChannels')).toBe(false)
        expect(isMutatingMethod('conversations.getConversations')).toBe(false)
        expect(isMutatingMethod('conversations.getConversation')).toBe(false)
        expect(isMutatingMethod('conversations.getUnread')).toBe(false)
        expect(isMutatingMethod('conversationMessages.getMessage')).toBe(false)
        expect(isMutatingMethod('conversationMessages.getMessages')).toBe(false)
        expect(isMutatingMethod('inbox.getInbox')).toBe(false)
    })

    it('treats unknown API methods as mutating (safe-by-default)', () => {
        expect(isMutatingMethod('someNewApi.newMethod')).toBe(true)
    })
})
