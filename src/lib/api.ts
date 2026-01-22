import { TwistApi, type User, type Workspace, type WorkspaceUser } from '@doist/twist-sdk'
import { getApiToken } from './auth.js'
import { getConfig, updateConfig } from './config.js'

let apiClient: TwistApi | null = null

export async function getTwistClient(): Promise<TwistApi> {
    if (!apiClient) {
        const token = await getApiToken()
        apiClient = new TwistApi(token)
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
