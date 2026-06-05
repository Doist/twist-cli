import { getTwistClient } from './api.js'
import { CliError } from './errors.js'
import { includePrivateChannels } from './global-args.js'

const publicChannelCache = new Map<number, Set<number>>()

export async function getPublicChannelIds(workspaceId: number): Promise<Set<number>> {
    const cached = publicChannelCache.get(workspaceId)
    if (cached) return cached

    const client = await getTwistClient()
    // getPublicChannels is workspace-scoped: it returns every public channel (active and
    // archived, joined and unjoined). getChannels is membership-scoped, so building the
    // allowlist from it alone wrongly excluded public channels the user hasn't joined — a
    // thread in such a channel was rejected as private (#263). getPublicChannels is a complete
    // superset of the public channels getChannels would surface, so it's the only call needed.
    const publicChannels = await client.workspaces.getPublicChannels(workspaceId)
    const publicIds = new Set(publicChannels.map((ch) => ch.id))
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
