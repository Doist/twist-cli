import type { Channel } from '@doist/twist-sdk'
import { getCurrentWorkspaceId, getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { includePrivateChannels } from '../../lib/global-args.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson, formatNdjson } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

const CHANNEL_SCOPES = ['joined', 'public', 'discoverable'] as const
const CHANNEL_STATES = ['active', 'all', 'archived'] as const

type ChannelScope = (typeof CHANNEL_SCOPES)[number]
type ChannelState = (typeof CHANNEL_STATES)[number]
type ListedChannel = Channel & { joined?: boolean }

export type ListChannelsOptions = ViewOptions & {
    workspace?: string
    scope?: string
    state?: string
}

function parseChannelScope(scope: string | undefined): ChannelScope {
    const resolved = scope ?? 'joined'
    if ((CHANNEL_SCOPES as readonly string[]).includes(resolved)) {
        return resolved as ChannelScope
    }

    throw new CliError(
        'INVALID_SCOPE',
        `Invalid channel scope: ${resolved}. Use one of: ${CHANNEL_SCOPES.join(', ')}.`,
    )
}

function parseChannelState(state: string | undefined): ChannelState {
    const resolved = state ?? 'active'
    if ((CHANNEL_STATES as readonly string[]).includes(resolved)) {
        return resolved as ChannelState
    }

    throw new CliError(
        'INVALID_STATE',
        `Invalid channel state: ${resolved}. Use one of: ${CHANNEL_STATES.join(', ')}.`,
    )
}

function summarizeChannel(channel: ListedChannel): Record<string, unknown> {
    return {
        id: channel.id,
        name: channel.name,
        workspaceId: channel.workspaceId,
        archived: channel.archived,
        ...(channel.joined !== undefined ? { joined: channel.joined } : {}),
    }
}

function formatListedChannelsJson(
    channels: ListedChannel[],
    _scope: ChannelScope,
    full = false,
): string {
    if (full) {
        return formatJson(channels, 'channel', true)
    }

    return JSON.stringify(channels.map(summarizeChannel), null, 2)
}

function formatListedChannelsNdjson(
    channels: ListedChannel[],
    _scope: ChannelScope,
    full = false,
): string {
    if (full) {
        return formatNdjson(channels, 'channel', true)
    }

    return channels.map((channel) => JSON.stringify(summarizeChannel(channel))).join('\n')
}

function matchesChannelState(channel: Channel, state: ChannelState): boolean {
    switch (state) {
        case 'active':
            return !channel.archived
        case 'all':
            return true
        case 'archived':
            return channel.archived
    }
}

function getStateLabel(state: ChannelState): string {
    switch (state) {
        case 'active':
            return 'active '
        case 'all':
            return ''
        case 'archived':
            return 'archived '
    }
}

function getEmptyStateMessage(scope: ChannelScope, state: ChannelState): string {
    const stateLabel = getStateLabel(state)
    switch (scope) {
        case 'joined':
            return `No ${stateLabel}channels found.`
        case 'public':
            return `No ${stateLabel}public channels found.`
        case 'discoverable':
            return `No ${stateLabel}discoverable channels found.`
    }
}

async function getWorkspaceId(
    workspaceRef: string | undefined,
    options: ListChannelsOptions,
): Promise<number> {
    if (workspaceRef && options.workspace) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot specify workspace both as argument and --workspace flag',
        )
    }

    const ref = workspaceRef || options.workspace

    if (ref) {
        const workspace = await resolveWorkspaceRef(ref)
        return workspace.id
    }

    return getCurrentWorkspaceId()
}

function formatChannelLine(channel: ListedChannel, scope: ChannelScope): string {
    const id = colors.timestamp(`id:${channel.id}`)
    const name = colors.channel(channel.name)
    const archived = channel.archived ? colors.timestamp(' (archived)') : ''
    const visibility = channel.public ? '' : colors.timestamp(' [private]')
    const membership =
        scope === 'public' && channel.joined !== undefined
            ? channel.joined
                ? colors.timestamp(' [joined]')
                : colors.timestamp(' [not joined]')
            : ''

    return `${id}  ${name}${visibility}${membership}${archived}`
}

export async function listChannels(
    workspaceRef: string | undefined,
    options: ListChannelsOptions,
): Promise<void> {
    const scope = parseChannelScope(options.scope)
    const state = parseChannelState(options.state)
    const workspaceId = await getWorkspaceId(workspaceRef, options)
    const client = await getTwistClient()
    let channels: ListedChannel[]

    if (scope === 'joined') {
        switch (state) {
            case 'active':
                channels = await client.channels.getChannels({ workspaceId, archived: false })
                break
            case 'all':
                channels = await client.channels.getChannels({ workspaceId })
                break
            case 'archived':
                channels = await client.channels.getChannels({ workspaceId, archived: true })
                break
        }

        if (!includePrivateChannels()) {
            channels = channels.filter((channel) => channel.public)
        }
    } else {
        const [joinedChannels, publicChannels] = await Promise.all([
            client.channels.getChannels({ workspaceId }),
            client.workspaces.getPublicChannels(workspaceId),
        ])
        const joinedIds = new Set(joinedChannels.map((channel) => channel.id))

        channels = publicChannels
            .filter((channel) => matchesChannelState(channel, state))
            .filter((channel) => scope === 'public' || !joinedIds.has(channel.id))
            .map((channel) => ({
                ...channel,
                joined: joinedIds.has(channel.id),
            }))
    }

    if (options.json) {
        console.log(formatListedChannelsJson(channels, scope, options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatListedChannelsNdjson(channels, scope, options.full))
        return
    }

    if (channels.length === 0) {
        console.log(getEmptyStateMessage(scope, state))
        return
    }

    for (const channel of channels) {
        console.log(formatChannelLine(channel, scope))
    }
}
