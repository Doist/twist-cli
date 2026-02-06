import { TwistApi, type User, type Workspace, type WorkspaceUser } from '@doist/twist-sdk'
import { getApiToken } from './auth.js'
import { getConfig, updateConfig } from './config.js'
import { getProgressTracker } from './progress.js'
import { withSpinner } from './spinner.js'

// Mapping of API method paths to user-friendly spinner messages
const API_SPINNER_MESSAGES: Record<string, { text: string; color?: 'blue' | 'green' | 'yellow' }> =
    {
        // User operations
        'users.getSessionUser': { text: 'Checking authentication...', color: 'blue' },

        // Workspace operations
        'workspaces.getWorkspaces': { text: 'Loading workspaces...', color: 'blue' },
        'workspaceUsers.getWorkspaceUsers': { text: 'Loading workspace users...', color: 'blue' },
        'workspaceUsers.getUserById': { text: 'Loading user details...', color: 'blue' },

        // Thread operations
        'threads.getThread': { text: 'Loading thread...', color: 'blue' },
        'threads.getUnread': { text: 'Loading unread threads...', color: 'blue' },

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
        'conversations.getConversation': { text: 'Loading conversation...', color: 'blue' },
        'conversations.getUnread': { text: 'Loading unread conversations...', color: 'blue' },
        'conversations.createConversation': { text: 'Creating conversation...', color: 'green' },
        'conversations.archiveConversation': { text: 'Archiving conversation...', color: 'yellow' },
        'conversations.unarchiveConversation': {
            text: 'Unarchiving conversation...',
            color: 'yellow',
        },

        // Conversation message operations
        'conversationMessages.getMessages': { text: 'Loading messages...', color: 'blue' },
        'conversationMessages.createMessage': { text: 'Sending message...', color: 'green' },
        'conversationMessages.updateMessage': { text: 'Updating message...', color: 'yellow' },
        'conversationMessages.deleteMessage': { text: 'Deleting message...', color: 'yellow' },

        // Inbox operations
        'inbox.getInbox': { text: 'Loading inbox...', color: 'blue' },
        'inbox.archiveThread': { text: 'Archiving thread...', color: 'yellow' },

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

            // Only wrap functions that are likely API calls
            if (typeof originalMethod === 'function' && typeof property === 'string') {
                const fullPath = `${basePath}.${property}`
                const spinnerConfig = API_SPINNER_MESSAGES[fullPath]

                if (spinnerConfig) {
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

                        const result = originalMethod.apply(target, args)

                        // If the method returns a Promise, wrap it with spinner and progress tracking
                        if (result && typeof result.then === 'function') {
                            const wrappedPromise = result
                                .then((response: unknown) => {
                                    // Emit progress event for successful response
                                    if (progressTracker.isEnabled()) {
                                        analyzeAndEmitApiResponse(progressTracker, response)
                                    }
                                    return response
                                })
                                .catch((error: Error) => {
                                    // Emit progress event for error
                                    if (progressTracker.isEnabled()) {
                                        progressTracker.emitError(
                                            error.name || 'API_ERROR',
                                            error.message,
                                        )
                                    }
                                    throw error
                                })

                            return withSpinner(spinnerConfig, () => wrappedPromise)
                        }

                        return result
                    }
                }
            }

            return originalMethod
        },
    })
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

export async function getTwistClient(): Promise<TwistApi> {
    if (!apiClient) {
        const token = await getApiToken()
        const rawApi = new TwistApi(token)
        apiClient = createSpinnerWrappedApi(rawApi)
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
        throw new Error('No workspaces found for this user')
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

export function clearUserCache(): void {
    sessionUserCache = null
}

export type { Workspace, WorkspaceUser, User }
