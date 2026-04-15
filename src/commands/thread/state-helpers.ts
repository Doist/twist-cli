import { readFile } from 'node:fs/promises'
import type { Thread, TwistApi, UnreadThread } from '@doist/twist-sdk'
import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
import type { BatchMutationOptions } from '../../lib/options.js'
import { formatJson, pluralize } from '../../lib/output.js'
import { assertChannelIsPublic } from '../../lib/public-channels.js'
import { resolveThreadId } from '../../lib/refs.js'

export type ThreadStateAction = 'done' | 'read' | 'reopen' | 'restore' | 'unread'

export type ThreadStateOptions = BatchMutationOptions & {
    unread?: boolean
}

type ThreadMutationStep = 'archiveInbox' | 'markRead' | 'markUnread' | 'unarchiveInbox'

type ThreadStateSnapshot = {
    id: number
    title: string
    isArchived: boolean
    inInbox: boolean
    isUnread: boolean
    closed: boolean
    lastUpdated: Date
}

type ThreadStateResult = {
    action: ThreadStateAction
    ref: string
    id?: number
    title?: string
    status: 'changed' | 'error' | 'preview' | 'unchanged'
    before?: ThreadStateSnapshot
    after?: ThreadStateSnapshot
    dryRun?: boolean
    requiresConfirmation?: boolean
    error?: {
        code: string
        message: string
    }
}

type LoadedThreadState = {
    thread: Thread
    snapshot: ThreadStateSnapshot
}

export async function runThreadStateCommand(
    action: ThreadStateAction,
    refs: string[],
    options: ThreadStateOptions,
): Promise<void> {
    const rawRefs = await collectThreadRefs(refs, options.fromFile)
    if (rawRefs.length === 0) {
        throw new CliError(
            'INVALID_REF',
            'No thread references provided. Pass refs as arguments or via --from-file.',
        )
    }

    const needsConfirmation = rawRefs.length > 1 && !options.yes && !options.dryRun
    if (options.json && needsConfirmation) {
        throw new CliError(
            'MISSING_YES_FLAG',
            '--yes is required to execute bulk thread state changes in --json mode.',
        )
    }

    const client = await getTwistClient()
    const unreadCache = new Map<number, UnreadThread[]>()

    const results: ThreadStateResult[] = []
    for (const rawRef of rawRefs) {
        results.push(
            await processThreadStateRef(client, unreadCache, action, rawRef, options, {
                needsConfirmation,
            }),
        )
    }

    if (options.json) {
        const payload = results.length === 1 ? results[0] : results
        console.log(formatJson(payload))
    } else {
        printThreadStateResults(action, results, options)
    }

    if (results.some((result) => result.status === 'error')) {
        process.exitCode = 1
    }
}

async function processThreadStateRef(
    client: TwistApi,
    unreadCache: Map<number, UnreadThread[]>,
    action: ThreadStateAction,
    rawRef: string,
    options: ThreadStateOptions,
    context: {
        needsConfirmation: boolean
    },
): Promise<ThreadStateResult> {
    let threadId: number
    try {
        threadId = resolveThreadId(rawRef)
    } catch (error) {
        return createErrorResult(action, rawRef, error)
    }

    let beforeState: LoadedThreadState
    try {
        beforeState = await loadThreadState(client, unreadCache, threadId)
    } catch (error) {
        return createErrorResult(action, rawRef, error, { id: threadId })
    }

    const mutationPlan = getMutationPlan(action, beforeState.snapshot, options)
    const predictedAfter = projectThreadState(beforeState.snapshot, mutationPlan)
    const baseResult = {
        action,
        ref: rawRef,
        id: beforeState.snapshot.id,
        title: beforeState.snapshot.title,
        before: beforeState.snapshot,
        after: mutationPlan.length > 0 ? predictedAfter : beforeState.snapshot,
    } satisfies Omit<ThreadStateResult, 'status'>

    if (mutationPlan.length === 0) {
        return {
            ...baseResult,
            status: 'unchanged',
        }
    }

    if (context.needsConfirmation) {
        return {
            ...baseResult,
            status: 'preview',
            requiresConfirmation: true,
        }
    }

    if (options.dryRun) {
        return {
            ...baseResult,
            status: 'preview',
            dryRun: true,
        }
    }

    try {
        for (const step of mutationPlan) {
            await applyThreadMutationStep(client, beforeState.thread, step)
        }

        unreadCache.delete(beforeState.thread.workspaceId)

        const afterState = await loadThreadState(client, unreadCache, threadId, {
            refreshUnread: true,
        })

        return {
            ...baseResult,
            after: afterState.snapshot,
            status: 'changed',
        }
    } catch (error) {
        unreadCache.delete(beforeState.thread.workspaceId)

        let afterSnapshot = baseResult.after
        try {
            const afterState = await loadThreadState(client, unreadCache, threadId, {
                refreshUnread: true,
            })
            afterSnapshot = afterState.snapshot
        } catch {
            // Keep the predicted state when the follow-up fetch also fails.
        }

        return {
            ...baseResult,
            after: afterSnapshot,
            status: 'error',
            error: serializeError(error),
            dryRun: false,
            requiresConfirmation: false,
        }
    }
}

async function collectThreadRefs(refs: string[], fromFile: string | undefined): Promise<string[]> {
    const inlineRefs = refs.map((ref) => ref.trim()).filter(Boolean)
    if (!fromFile) {
        return inlineRefs
    }

    let content: string
    try {
        content = await readFile(fromFile, 'utf8')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new CliError('FILE_READ_ERROR', `Could not read refs file: ${fromFile}`, [message])
    }

    const fileRefs = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'))

    return [...inlineRefs, ...fileRefs]
}

async function loadThreadState(
    client: TwistApi,
    unreadCache: Map<number, UnreadThread[]>,
    threadId: number,
    options?: {
        refreshUnread?: boolean
    },
): Promise<LoadedThreadState> {
    const thread = await client.threads.getThread(threadId)
    await assertChannelIsPublic(thread.channelId, thread.workspaceId)
    const unreadThreads = await getUnreadThreads(
        client,
        unreadCache,
        thread.workspaceId,
        options?.refreshUnread ?? false,
    )
    const isUnread = unreadThreads.some((unreadThread) => unreadThread.threadId === thread.id)
    return {
        thread,
        snapshot: createThreadSnapshot(thread, isUnread),
    }
}

async function getUnreadThreads(
    client: TwistApi,
    unreadCache: Map<number, UnreadThread[]>,
    workspaceId: number,
    refresh: boolean,
): Promise<UnreadThread[]> {
    if (!refresh && unreadCache.has(workspaceId)) {
        return unreadCache.get(workspaceId) ?? []
    }

    const unreadThreads = await client.threads.getUnread(workspaceId)
    unreadCache.set(workspaceId, unreadThreads)
    return unreadThreads
}

function createThreadSnapshot(thread: Thread, isUnread: boolean): ThreadStateSnapshot {
    return {
        id: thread.id,
        title: thread.title,
        isArchived: thread.isArchived,
        inInbox: thread.inInbox ?? false,
        isUnread,
        closed: thread.closed ?? false,
        lastUpdated: thread.lastUpdated,
    }
}

function getMutationPlan(
    action: ThreadStateAction,
    snapshot: ThreadStateSnapshot,
    options: ThreadStateOptions,
): ThreadMutationStep[] {
    switch (action) {
        case 'done':
            return snapshot.inInbox || !snapshot.isArchived ? ['archiveInbox'] : []
        case 'reopen':
            return !snapshot.inInbox || snapshot.isArchived ? ['unarchiveInbox'] : []
        case 'read':
            return snapshot.isUnread ? ['markRead'] : []
        case 'unread':
            return snapshot.isUnread ? [] : ['markUnread']
        case 'restore': {
            const steps: ThreadMutationStep[] = []
            if (!snapshot.inInbox || snapshot.isArchived) {
                steps.push('unarchiveInbox')
            }
            if (options.unread && !snapshot.isUnread) {
                steps.push('markUnread')
            }
            return steps
        }
    }
}

function projectThreadState(
    snapshot: ThreadStateSnapshot,
    steps: ThreadMutationStep[],
): ThreadStateSnapshot {
    return steps.reduce<ThreadStateSnapshot>((current, step) => {
        switch (step) {
            case 'archiveInbox':
                return { ...current, inInbox: false, isArchived: true }
            case 'unarchiveInbox':
                return { ...current, inInbox: true, isArchived: false }
            case 'markRead':
                return { ...current, isUnread: false }
            case 'markUnread':
                return { ...current, isUnread: true }
        }
    }, snapshot)
}

async function applyThreadMutationStep(
    client: TwistApi,
    thread: Thread,
    step: ThreadMutationStep,
): Promise<void> {
    switch (step) {
        case 'archiveInbox':
            await client.inbox.archiveThread(thread.id)
            return
        case 'unarchiveInbox':
            await client.inbox.unarchiveThread(thread.id)
            return
        case 'markRead':
            await client.threads.markRead({ id: thread.id, objIndex: getLastObjIndex(thread) })
            return
        case 'markUnread':
            await client.threads.markUnread({ id: thread.id, objIndex: -1 })
            return
    }
}

function getLastObjIndex(thread: Thread): number {
    return Math.max(
        thread.lastComment?.objIndex ?? thread.lastObjIndex ?? thread.commentCount ?? 0,
        0,
    )
}

function createErrorResult(
    action: ThreadStateAction,
    rawRef: string,
    error: unknown,
    context?: {
        id?: number
        title?: string
    },
): ThreadStateResult {
    return {
        action,
        ref: rawRef,
        id: context?.id,
        title: context?.title,
        status: 'error',
        error: serializeError(error),
    }
}

function serializeError(error: unknown): { code: string; message: string } {
    if (error instanceof CliError) {
        return { code: error.code, message: error.message }
    }
    if (error instanceof Error) {
        return { code: 'API_ERROR', message: error.message }
    }
    return { code: 'INTERNAL_ERROR', message: 'Unknown error' }
}

function printThreadStateResults(
    action: ThreadStateAction,
    results: ThreadStateResult[],
    options: ThreadStateOptions,
): void {
    for (const result of results) {
        if (result.status === 'error') {
            const target = result.id ? `thread ${result.id}` : `ref "${result.ref}"`
            console.error(
                `Failed to ${action} ${target}: ${result.error?.message ?? 'Unknown error'}`,
            )
            continue
        }

        const threadLabel = `${result.title} (${result.id})`
        if (result.status === 'preview') {
            const prefix = result.dryRun ? 'Dry run: would' : 'Would'
            const infinitive = describeStateChange(
                action,
                options,
                result.before,
                result.after,
            ).infinitive
            console.log(`${prefix} ${infinitive} thread ${threadLabel}.`)
            continue
        }

        if (result.status === 'unchanged') {
            console.log(`Thread ${threadLabel} is ${describeStableState(action, options)}.`)
            continue
        }

        const pastTense = describeStateChange(action, options, result.before, result.after).past
        console.log(`Thread ${threadLabel} ${pastTense}.`)
    }

    if (results.length > 1) {
        const summary = [
            summarizeResultCount(results, 'changed'),
            summarizeResultCount(results, 'unchanged'),
            summarizeResultCount(results, 'preview'),
            summarizeResultCount(results, 'error'),
        ].filter(Boolean)

        console.log('')
        console.log(`Summary: ${summary.join(', ')}`)
    }

    if (results.some((result) => result.requiresConfirmation)) {
        console.log('Use --yes to confirm.')
    }
}

function summarizeResultCount(
    results: ThreadStateResult[],
    status: ThreadStateResult['status'],
): string | null {
    const count = results.filter((result) => result.status === status).length
    if (count === 0) {
        return null
    }

    const noun =
        status === 'error'
            ? pluralize(count, 'failure')
            : status === 'preview'
              ? pluralize(count, 'preview')
              : pluralize(count, 'thread')

    switch (status) {
        case 'changed':
            return `${count} changed ${noun}`
        case 'unchanged':
            return `${count} unchanged ${noun}`
        case 'preview':
            return `${count} ${noun}`
        case 'error':
            return `${count} ${noun}`
    }
}

function describeStableState(action: ThreadStateAction, options: ThreadStateOptions): string {
    switch (action) {
        case 'done':
            return 'already done'
        case 'read':
            return 'already read'
        case 'reopen':
            return 'already open'
        case 'restore':
            return options.unread ? 'already open and unread' : 'already open'
        case 'unread':
            return 'already unread'
    }
}

function describeStateChange(
    action: ThreadStateAction,
    options: ThreadStateOptions,
    before: ThreadStateSnapshot | undefined,
    after: ThreadStateSnapshot | undefined,
): {
    infinitive: string
    past: string
} {
    if (action === 'restore') {
        const reopened = before && after ? before.inInbox !== after.inInbox : true
        const unreadChanged = before && after ? before.isUnread !== after.isUnread : options.unread

        if (reopened && unreadChanged) {
            return { infinitive: 'restore and mark unread', past: 'restored and marked unread' }
        }
        if (reopened) {
            return { infinitive: 'restore', past: 'restored' }
        }
        if (unreadChanged) {
            return { infinitive: 'mark unread', past: 'marked unread' }
        }
    }

    switch (action) {
        case 'done':
            return { infinitive: 'archive', past: 'archived' }
        case 'read':
            return { infinitive: 'mark read', past: 'marked read' }
        case 'reopen':
            return { infinitive: 'reopen', past: 'reopened' }
        case 'restore':
            return { infinitive: 'restore', past: 'restored' }
        case 'unread':
            return { infinitive: 'mark unread', past: 'marked unread' }
    }
}
