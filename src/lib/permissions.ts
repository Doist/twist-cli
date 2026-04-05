import { getAuthMetadata } from './auth.js'
import { CliError } from './errors.js'

export const READ_ONLY_ERROR_MESSAGE =
    'This CLI is authenticated in read-only mode. Re-run `tw auth login` without --read-only to enable write operations.'

/**
 * Known read-only API method paths. Any method not in this set is assumed to be mutating.
 * This is a safe-by-default approach: new API methods are blocked until explicitly allowed.
 */
const KNOWN_SAFE_API_METHODS = new Set([
    'users.getSessionUser',
    'workspaces.getWorkspaces',
    'workspaceUsers.getWorkspaceUsers',
    'workspaceUsers.getUserById',
    'threads.getThread',
    'threads.getUnread',
    'comments.getComment',
    'comments.getComments',
    'channels.getChannel',
    'channels.getChannels',
    'conversations.getConversations',
    'conversations.getConversation',
    'conversations.getUnread',
    'conversationMessages.getMessage',
    'conversationMessages.getMessages',
    'inbox.getInbox',
    'batch',
])

export function isMutatingMethod(methodPath: string): boolean {
    return !KNOWN_SAFE_API_METHODS.has(methodPath)
}

export async function ensureWriteAllowed(): Promise<void> {
    const metadata = await getAuthMetadata()
    if (metadata.authMode === 'read-only') {
        throw new CliError('READ_ONLY', READ_ONLY_ERROR_MESSAGE)
    }
}
