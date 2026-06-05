import { getTwistClient } from './api.js'
import { CliError } from './errors.js'
import { includePrivateChannels } from './global-args.js'

const publicChannelCache = new Map<number, Set<number>>()

export async function getPublicChannelIds(workspaceId: number): Promise<Set<number>> {
    const cached = publicChannelCache.get(workspaceId)
    if (cached) return cached

    const client = await getTwistClient()
    // getChannels is membership-scoped — it returns only channels the current user has joined,
    // so public channels the user hasn't joined are excluded. Merge with getPublicChannels
    // (workspace-scoped, returns all public channels regardless of membership) so a thread in
    // an unjoined-but-public channel isn't wrongly rejected as private. Mirrors resolveChannelRef
    // in refs.ts.
    const [joined, publicChannels] = await Promise.all([
        client.channels.getChannels({ workspaceId }),
        client.workspaces.getPublicChannels(workspaceId),
    ])
    const publicIds = new Set<number>()
    for (const ch of joined) {
        if (ch.public) publicIds.add(ch.id)
    }
    for (const ch of publicChannels) {
        publicIds.add(ch.id)
    }
    publicChannelCache.set(workspaceId, publicIds)
    return publicIds
}

export function clearPublicChannelCache(): void {
    publicChannelCache.clear()
}

export async function assertChannelIsPublic(channelId: number, workspaceId: number): Promise<void> {
    if (includePrivateChannels()) return
    const publicIds = await getPublicChannelIds(workspaceId)
    if (!publicIds.has(channelId)) {
        throw new CliError('NOT_FOUND', 'This thread belongs to a private channel.', [
            'Use --include-private-channels to access it',
        ])
    }
}
