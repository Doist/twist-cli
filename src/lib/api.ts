import {
    type Group,
    TwistApi,
    type User,
    type Workspace,
    type WorkspaceUser,
} from '@doist/twist-sdk'
import { resolveActiveAccount } from './auth.js'
import { getConfig, updateConfig } from './config.js'
import { CliError, isInsufficientScope } from './errors.js'
import { ensureWriteAllowed, isMutatingMethod } from './permissions.js'
import { getProgressTracker } from './progress.js'
import { withSpinner } from './spinner.js'

// Mapping of API method paths to user-friendly spinner messages
const API_SPINNER_MESSAGES: Record<string, { text: string; color?: 'blue' | 'green' | 'yellow' }> =
    {
        // User operations
        'users.getSessionUser': { text: 'Checking authentication...', color: 'blue' },

        'users.update': { text: 'Updating user...', color: 'yellow' },

        // Workspace operations
        'workspaces.getWorkspaces': { text: 'Loading workspaces...', color: 'blue' },
        'workspaces.getPublicChannels': { text: 'Loading public channels...', color: 'blue' },
        'workspaceUsers.getWorkspaceUsers': { text: 'Loading workspace users...', color: 'blue' },
        'workspaceUsers.getUserById': { text: 'Loading user details...', color: 'blue' },

        // Thread operations
        'threads.getThread': { text: 'Loading thread...', color: 'blue' },
        'threads.getThreads': { text: 'Loading threads...', color: 'blue' },
        'threads.getUnread': { text: 'Loading unread threads...', color: 'blue' },
        'threads.createThread': { text: 'Creating thread...', color: 'green' },
        'threads.closeThread': { text: 'Closing thread...', color: 'yellow' },
        'threads.reopenThread': { text: 'Reopening thread...', color: 'yellow' },
        'threads.updateThread': { text: 'Updating thread...', color: 'yellow' },
        'threads.muteThread': { text: 'Muting thread...', color: 'yellow' },
        'threads.unmuteThread': { text: 'Unmuting thread...', color: 'yellow' },
        'threads.deleteThread': { text: 'Deleting thread...', color: 'yellow' },

        // Comment operations
        'comments.getComment': { text: 'Loading comment...', color: 'blue' },
        'comments.getComments': { text: 'Loading comments...', color: 'blue' },
        'comments.createComment': { text: 'Creating comment...', color: 'green' },
        'comments.updateComment': { text: 'Updating comment...', color: 'yellow' },
        'comments.deleteComment': { text: 'Deleting comment...', color: 'yellow' },

        // Channel operations
        'channels.getChannel': { text: 'Loading channel...', color: 'blue' },
        'channels.getChannels': { text: 'Loading channels...', color: 'blue' },
        'channels.createChannel': { text: 'Creating channel...', color: 'green' },
        'channels.updateChannel': { text: 'Updating channel...', color: 'yellow' },
        'channels.deleteChannel': { text: 'Deleting channel...', color: 'yellow' },

        // Conversation operations
        'conversations.getConversations': { text: 'Loading conversations...', color: 'blue' },
        'conversations.getConversation': { text: 'Loading conversation...', color: 'blue' },
        'conversations.getUnread': { text: 'Loading unread conversations...', color: 'blue' },
        'conversations.createConversation': { text: 'Creating conversation...', color: 'green' },
        'conversations.archiveConversation': { text: 'Archiving conversation...', color: 'yellow' },
        'conversations.unarchiveConversation': {
            text: 'Unarchiving conversation...',
            color: 'yellow',
        },
        'conversations.muteConversation': { text: 'Muting conversation...', color: 'yellow' },
        'conversations.unmuteConversation': {
            text: 'Unmuting conversation...',
            color: 'yellow',
        },

        // Conversation message operations
        'conversationMessages.getMessage': { text: 'Loading message...', color: 'blue' },
        'conversationMessages.getMessages': { text: 'Loading messages...', color: 'blue' },
        'conversationMessages.createMessage': { text: 'Sending message...', color: 'green' },
        'conversationMessages.updateMessage': { text: 'Updating message...', color: 'yellow' },
        'conversationMessages.deleteMessage': { text: 'Deleting message...', color: 'yellow' },

        // Group operations
        'groups.getGroups': { text: 'Loading groups...', color: 'blue' },
        'groups.getGroup': { text: 'Loading group...', color: 'blue' },
        'groups.createGroup': { text: 'Creating group...', color: 'green' },
        'groups.updateGroup': { text: 'Updating group...', color: 'yellow' },
        'groups.deleteGroup': { text: 'Deleting group...', color: 'yellow' },
        'groups.addUsers': { text: 'Adding users to group...', color: 'green' },
        'groups.removeUsers': { text: 'Removing users from group...', color: 'yellow' },

        // Inbox operations
        'inbox.getInbox': { text: 'Loading inbox...', color: 'blue' },
        'inbox.archiveThread': { text: 'Archiving thread...', color: 'yellow' },
        'inbox.unarchiveThread': { text: 'Unarchiving thread...', color: 'yellow' },

        // Batch operations
        batch: { text: 'Processing batch operations...', color: 'blue' },
    }

function createSpinnerWrappedApi(api: TwistApi): TwistApi {
    return new Proxy(api, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver)

            // If this is a nested object (like workspaces, users, etc.), wrap it too
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                typeof property === 'string'
            ) {
                return createNestedSpinnerProxy(value, property)
            }

            return value
        },
    })
}

function createNestedSpinnerProxy<T extends object>(obj: T, basePath: string): T {
    return new Proxy(obj, {
        get(target, property, receiver) {
            const originalMethod = Reflect.get(target, property, receiver)

            if (typeof originalMethod !== 'function' || typeof property !== 'string') {
                return originalMethod
            }

            const fullPath = `${basePath}.${property}`
            const spinnerConfig = API_SPINNER_MESSAGES[fullPath]
            const shouldCheckPermissions = isMutatingMethod(fullPath)

            if (!spinnerConfig && !shouldCheckPermissions) {
                return originalMethod
            }

            return <T extends unknown[]>(...args: T) => {
                const progressTracker = getProgressTracker()

                // Extract cursor from args for paginated methods
                let cursor: string | null = null
                if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                    const options = args[0] as Record<string, unknown>
                    if ('cursor' in options && typeof options.cursor === 'string') {
                        cursor = options.cursor
                    }
                }

                // Emit progress event for API call start
                if (progressTracker.isEnabled()) {
                    progressTracker.emitApiCall(property, cursor)
                }

                // For mutating methods, check permissions before calling the API
                if (shouldCheckPermissions) {
                    return ensureWriteAllowed().then(() => {
                        const result = originalMethod.apply(target, args)
                        return wrapResult(result, progressTracker, spinnerConfig)
                    })
                }

                const result = originalMethod.apply(target, args)
                return wrapResult(result, progressTracker, spinnerConfig)
            }
        },
    })
}

function wrapResult(
    result: unknown,
    progressTracker: ReturnType<typeof getProgressTracker>,
    spinnerConfig: (typeof API_SPINNER_MESSAGES)[string] | undefined,
): unknown {
    // If the method returns a non-thenable (e.g. batch request builder), return as-is
    if (!result || typeof (result as { then?: unknown }).then !== 'function') {
        return result
    }

    const wrappedPromise = (result as Promise<unknown>)
        .then((response: unknown) => {
            if (progressTracker.isEnabled()) {
                analyzeAndEmitApiResponse(progressTracker, response)
            }
            return response
        })
        .catch((error: Error) => {
            if (progressTracker.isEnabled()) {
                progressTracker.emitError(error.name || 'API_ERROR', error.message)
            }
            if (isInsufficientScope(error)) {
                throw new CliError(
                    'INSUFFICIENT_SCOPE',
                    'This action requires permissions your current token does not have.',
                    ['Run `tw auth login` to re-authenticate with the required scopes'],
                )
            }
            throw error
        })

    if (spinnerConfig) {
        return withSpinner(spinnerConfig, () => wrappedPromise)
    }
    return wrappedPromise
}

function analyzeAndEmitApiResponse(
    progressTracker: ReturnType<typeof getProgressTracker>,
    response: unknown,
): void {
    // For paginated responses, extract metadata
    if (response && typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>

        // Check if it's a paginated response with results array
        if ('results' in resp && Array.isArray(resp.results)) {
            progressTracker.emitApiResponse(
                resp.results.length,
                Boolean(resp.nextCursor),
                typeof resp.nextCursor === 'string' ? resp.nextCursor : null,
            )
            return
        }

        // For array responses (legacy or simple lists)
        if (Array.isArray(response)) {
            progressTracker.emitApiResponse(response.length, false, null)
            return
        }
    }

    // For other responses, emit minimal info
    progressTracker.emitApiResponse(1, false, null)
}

let apiClient: TwistApi | null = null

export function createWrappedTwistClient(token: string): TwistApi {
    const rawApi = new TwistApi(token)
    return createSpinnerWrappedApi(rawApi)
}

export async function getTwistClient(): Promise<TwistApi> {
    if (!apiClient) {
        const resolved = await resolveActiveAccount()
        apiClient = createWrappedTwistClient(resolved.token)
    }
    return apiClient
}

let workspaceCache: Workspace[] | null = null
let sessionUserCache: User | null = null

export async function fetchWorkspaces(): Promise<Workspace[]> {
    if (workspaceCache) {
        return workspaceCache
    }
    const client = await getTwistClient()
    workspaceCache = await client.workspaces.getWorkspaces()
    return workspaceCache
}

export function clearWorkspaceCache(): void {
    workspaceCache = null
}

export async function getCurrentWorkspaceId(flagValue?: number): Promise<number> {
    if (flagValue) {
        return flagValue
    }

    const config = await getConfig()
    if (config.currentWorkspace) {
        return config.currentWorkspace
    }

    const sessionUser = await getSessionUser()
    if (sessionUser.defaultWorkspace) {
        await updateConfig({ currentWorkspace: sessionUser.defaultWorkspace })
        return sessionUser.defaultWorkspace
    }

    const workspaces = await fetchWorkspaces()
    if (workspaces.length === 0) {
        throw new CliError('NOT_FOUND', 'No workspaces found for this user', [
            'Ensure your account has been added to a workspace',
        ])
    }

    const defaultWorkspace = workspaces[0]
    await updateConfig({ currentWorkspace: defaultWorkspace.id })
    return defaultWorkspace.id
}

export async function getSessionUser(): Promise<User> {
    if (sessionUserCache) {
        return sessionUserCache
    }
    const client = await getTwistClient()
    sessionUserCache = await client.users.getSessionUser()
    return sessionUserCache
}

export async function getWorkspaceUsers(workspaceId: number): Promise<WorkspaceUser[]> {
    const client = await getTwistClient()
    return client.workspaceUsers.getWorkspaceUsers({ workspaceId })
}

export async function getWorkspaceGroups(workspaceId: number): Promise<Group[]> {
    const client = await getTwistClient()
    return client.groups.getGroups(workspaceId)
}

export async function getGroup(id: number): Promise<Group> {
    const client = await getTwistClient()
    return client.groups.getGroup(id)
}

export async function createGroup(args: {
    workspaceId: number
    name: string
    userIds?: number[]
}): Promise<Group> {
    const client = await getTwistClient()
    return client.groups.createGroup(args)
}

export async function updateGroup(args: { id: number; name?: string }): Promise<Group> {
    const client = await getTwistClient()
    return client.groups.updateGroup(args)
}

export async function deleteGroup(id: number): Promise<void> {
    const client = await getTwistClient()
    await client.groups.deleteGroup(id)
}

export async function addUsersToGroup(id: number, userIds: number[]): Promise<void> {
    const client = await getTwistClient()
    await client.groups.addUsers({ id, userIds })
}

export async function removeUsersFromGroup(id: number, userIds: number[]): Promise<void> {
    const client = await getTwistClient()
    await client.groups.removeUsers({ id, userIds })
}

export function clearUserCache(): void {
    sessionUserCache = null
}

/**
 * Validates a batch response and returns the data, throwing on errors.
 * Also handles the case where the SDK fails to validate the response schema
 * (e.g. when the batch API wraps entities in a key like `{comment: {...}}`).
 * In that case, the raw transformed data is returned — check for expected fields.
 */
export function assertBatchData<T>(response: { code: number; data: T }, label: string): T {
    if (response.code >= 400 || response.data == null) {
        throw new CliError('BATCH_FAILED', `Failed to fetch ${label}.`)
    }
    return response.data
}

export type { Group, User, Workspace, WorkspaceUser }
