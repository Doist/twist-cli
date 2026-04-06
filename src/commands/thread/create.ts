import { getTwistClient, getWorkspaceGroups, getWorkspaceUsers } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, partitionNotifyIds, resolveChannelId } from '../../lib/refs.js'
import { type NotifiedInfo, buildNotifiedInfo, printNotifyLines } from './helpers.js'

type CreateOptions = MutationOptions & {
    notify?: string
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

    let recipients: number[] | undefined
    let groups: number[] | undefined
    let notified: NotifiedInfo | undefined
    if (allIds) {
        const workspaceGroups = await getWorkspaceGroups(channel.workspaceId)
        const groupIdSet = new Set(workspaceGroups.map((g) => g.id))
        const partitioned = partitionNotifyIds(allIds, groupIdSet)
        recipients = partitioned.userIds.length > 0 ? partitioned.userIds : undefined
        groups = partitioned.groupIds.length > 0 ? partitioned.groupIds : undefined
        const workspaceUserList = await getWorkspaceUsers(channel.workspaceId)
        notified = buildNotifiedInfo(recipients, groups, workspaceUserList, workspaceGroups)
    }

    if (options.dryRun) {
        console.log('Dry run: would create thread in channel', channelId)
        console.log(`Title: ${title}`)
        if (notified) {
            printNotifyLines(notified)
        }
        console.log('')
        console.log(threadContent)
        return
    }

    const thread = await client.threads.createThread({
        channelId,
        title,
        content: threadContent,
        recipients,
        groups,
    })

    if (options.json) {
        const output = notified ? { ...thread, notified } : thread
        console.log(formatJson(output, 'thread', options.full))
        return
    }

    console.log(`Thread created: ${thread.url}`)
}
