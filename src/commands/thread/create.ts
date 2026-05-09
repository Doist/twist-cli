import { getTwistClient } from '../../lib/api.js'
import { readConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, resolveChannelId } from '../../lib/refs.js'
import { type ResolvedNotify, formatNotifyLabel, resolveNotifyIds } from './helpers.js'

type CreateOptions = MutationOptions & {
    notify?: string
    unarchive?: boolean
}

export async function createThread(
    channelRef: string,
    title: string,
    content: string | undefined,
    options: CreateOptions,
): Promise<void> {
    const channelId = resolveChannelId(channelRef)

    let threadContent = await readStdin()
    if (!threadContent && content) {
        threadContent = content
    }
    if (!threadContent) {
        threadContent = await openEditor()
    }
    if (!threadContent || threadContent.trim() === '') {
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument or pipe via stdin.',
        )
    }

    const allIds = options.notify ? parseUserIdRefs(options.notify) : undefined

    const client = await getTwistClient()
    const channel = await client.channels.getChannel(channelId)
    await assertChannelIsPublic(channelId, channel.workspaceId)

    let resolved: ResolvedNotify | undefined
    if (allIds) {
        resolved = await resolveNotifyIds(allIds, channel.workspaceId)
    }

    const config = await readConfig()
    const shouldUnarchive = options.unarchive ?? config.userSettings?.unarchiveNewThreads ?? false

    if (options.dryRun) {
        const preview =
            threadContent.length > 200 ? `${threadContent.slice(0, 200)}...` : threadContent
        printDryRun('create thread', {
            Channel: `${channel.name} (${channelId})`,
            Title: title,
            'Notify users':
                resolved && resolved.notified.users.length > 0
                    ? formatNotifyLabel(resolved.notified.users)
                    : undefined,
            'Notify groups':
                resolved && resolved.notified.groups.length > 0
                    ? formatNotifyLabel(resolved.notified.groups)
                    : undefined,
            Unarchive: shouldUnarchive ? 'yes' : undefined,
            Content: preview,
        })
        return
    }

    const thread = await client.threads.createThread({
        channelId,
        title,
        content: threadContent,
        recipients: resolved?.recipients,
        groups: resolved?.groups,
    })

    if (shouldUnarchive) {
        try {
            await client.inbox.unarchiveThread(thread.id)
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            console.error(`Warning: created thread but failed to unarchive it (${detail})`)
        }
    }

    if (options.json) {
        const output = resolved ? { ...thread, notified: resolved.notified } : thread
        console.log(formatJson(output, 'thread', options.full))
        return
    }

    console.log(`Thread created: ${thread.url}`)
}
