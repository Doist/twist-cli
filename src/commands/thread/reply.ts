import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { parseUserIdRefs, resolveThreadId } from '../../lib/refs.js'
import { type ResolvedNotify, printNotifyLines, resolveNotifyIds } from './helpers.js'

type ReplyOptions = MutationOptions & {
    notify?: string
    close?: boolean
    reopen?: boolean
}

export async function replyToThread(
    ref: string,
    content: string | undefined,
    options: ReplyOptions,
): Promise<void> {
    const threadId = resolveThreadId(ref)

    if (options.close && options.reopen) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use --close and --reopen together.')
    }

    let replyContent = await readStdin()
    if (!replyContent && content) {
        replyContent = content
    }
    if (!replyContent) {
        replyContent = await openEditor()
    }
    if (!replyContent || replyContent.trim() === '') {
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument or pipe via stdin.',
        )
    }

    const notifyValue = options.notify ?? 'EVERYONE_IN_THREAD'
    const isSpecialRecipient = notifyValue === 'EVERYONE' || notifyValue === 'EVERYONE_IN_THREAD'

    const client = await getTwistClient()
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)

    let recipients: string | number[] | undefined
    let resolved: ResolvedNotify | undefined
    if (isSpecialRecipient) {
        recipients = notifyValue
    } else {
        const allIds = parseUserIdRefs(notifyValue)
        resolved = await resolveNotifyIds(allIds, thread.workspaceId)
        recipients = resolved.recipients
    }

    const action = options.close ? 'close' : options.reopen ? 'reopen' : undefined
    const actionLabel = action === 'close' ? 'close' : action === 'reopen' ? 'reopen' : undefined

    if (options.dryRun) {
        const actionSuffix = actionLabel ? ` and ${actionLabel} it` : ''
        console.log(`Dry run: would post comment to thread ${threadId}${actionSuffix}`)
        if (isSpecialRecipient) {
            console.log(`Notify: ${notifyValue}`)
        } else if (resolved) {
            printNotifyLines(resolved.notified)
        }
        console.log('')
        console.log(replyContent)
        return
    }

    const groupsPayload = resolved?.groups ? { groups: resolved.groups } : {}

    const comment =
        action === 'close'
            ? await client.threads.closeThread({
                  id: threadId,
                  content: replyContent,
                  recipients,
                  ...groupsPayload,
              } as Parameters<typeof client.threads.closeThread>[0])
            : action === 'reopen'
              ? await client.threads.reopenThread({
                    id: threadId,
                    content: replyContent,
                    recipients,
                    ...groupsPayload,
                } as Parameters<typeof client.threads.reopenThread>[0])
              : await client.comments.createComment({
                    threadId,
                    content: replyContent,
                    recipients,
                    ...groupsPayload,
                } as Parameters<typeof client.comments.createComment>[0])

    if (options.json) {
        const output = resolved ? { ...comment, notified: resolved.notified } : comment
        console.log(formatJson(output, 'comment', options.full))
        return
    }

    const suffix = actionLabel ? ` (thread ${actionLabel === 'close' ? 'closed' : 'reopened'})` : ''
    console.log(`Comment posted${suffix}: ${comment.url}`)
}
