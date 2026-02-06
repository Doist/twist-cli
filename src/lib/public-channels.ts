import { getTwistClient } from './api.js'

export function includePrivateChannels(): boolean {
    const envVal = process.env.TWIST_INCLUDE_PRIVATE_CHANNELS
    if (envVal === '1' || envVal === 'true') {
        return true
    }
    return process.argv.includes('--include-private-channels')
}

const publicChannelCache = new Map<number, Set<number>>()

export async function getPublicChannelIds(workspaceId: number): Promise<Set<number>> {
    const cached = publicChannelCache.get(workspaceId)
    if (cached) return cached

    const client = await getTwistClient()
    const channels = await client.channels.getChannels({ workspaceId })
    const publicIds = new Set<number>()
    for (const ch of channels) {
        if (ch.public) publicIds.add(ch.id)
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
        throw new Error(
            'This thread belongs to a private channel. Use --include-private-channels to access it.',
        )
    }
}
