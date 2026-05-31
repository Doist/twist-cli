import chalk from 'chalk'
import { getTwistClient } from '../../lib/api.js'
import { uploadAttachments } from '../../lib/attachments.js'
import { getConfig } from '../../lib/config.js'
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
    file?: string[]
}

export async function createThread(
    channelRef: string,
    title: string,
    content: string | undefined,
    options: CreateOptions,
): Promise<void> {
    const channelId = resolveChannelId(channelRef)

    const files = options.file ?? []
    const hasFiles = files.length > 0

    let threadContent = await readStdin()
    if (!threadContent && content) {
        threadContent = content
    }
    // A file-only thread is allowed: skip the editor prompt and the empty-content guard.
    if (!threadContent && !hasFiles) {
        threadContent = await openEditor()
    }
    if ((!threadContent || threadContent.trim() === '') && !hasFiles) {
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument, pipe via stdin, or attach a file.',
        )
    }
    const messageContent = threadContent ?? ''

    const allIds = options.notify ? parseUserIdRefs(options.notify) : undefined

    const client = await getTwistClient()
    const channel = await client.channels.getChannel(channelId)
    await assertChannelIsPublic(channelId, channel.workspaceId)

    let resolved: ResolvedNotify | undefined
    if (allIds) {
        resolved = await resolveNotifyIds(allIds, channel.workspaceId)
    }

    const config = await getConfig()
    const shouldUnarchive = options.unarchive ?? config.userSettings?.unarchiveNewThreads ?? false

    if (options.dryRun) {
        const preview =
            messageContent.length > 200 ? `${messageContent.slice(0, 200)}...` : messageContent
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
            Attach: hasFiles ? files.join(', ') : undefined,
            Content: preview || undefined,
        })
        return
    }

    const attachments = hasFiles ? await uploadAttachments(files) : undefined

    const thread = await client.threads.createThread({
        channelId,
        title,
        content: messageContent,
        recipients: resolved?.recipients,
        groups: resolved?.groups,
        attachments,
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
    if (attachments && attachments.length > 0) {
        const names = attachments.map((a) => a.fileName ?? 'file').join(', ')
        console.log(chalk.dim(`Attached: ${names}`))
    }
}
