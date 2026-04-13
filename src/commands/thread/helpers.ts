import chalk from 'chalk'
import { getWorkspaceGroups, getWorkspaceUsers } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { isAccessible } from '../../lib/global-args.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { colors } from '../../lib/output.js'
import { partitionNotifyIds } from '../../lib/refs.js'

export function printSeparator(label: string): void {
    const totalWidth = 60
    const labelWithPadding = ` ${label} `
    const remainingWidth = totalWidth - labelWithPadding.length
    const leftWidth = Math.floor(remainingWidth / 2)
    const rightWidth = remainingWidth - leftWidth
    const dashChar = isAccessible() ? '-' : '─'
    const line = chalk.dim(
        dashChar.repeat(leftWidth) + labelWithPadding + dashChar.repeat(rightWidth),
    )
    console.log('')
    console.log(line)
    console.log('')
}

export interface CommentLike {
    id: number
    creator: number
    posted: Date
    content: string
}

export async function printComment(
    comment: CommentLike,
    userMap: Map<number, string>,
    raw: boolean,
): Promise<void> {
    const author = colors.author(userMap.get(comment.creator) || `user:${comment.creator}`)
    const time = colors.timestamp(formatRelativeDate(comment.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${comment.id}`)}`)
    console.log(raw ? comment.content : await renderMarkdown(comment.content))
    console.log('')
}

export type NamedEntity = { id: number; name: string }

export interface NotifiedInfo {
    users: NamedEntity[]
    groups: NamedEntity[]
}

export interface ResolvedNotify {
    recipients: number[] | undefined
    groups: number[] | undefined
    notified: NotifiedInfo
}

export async function resolveNotifyIds(
    ids: number[],
    workspaceId: number,
): Promise<ResolvedNotify> {
    const workspaceGroups = await getWorkspaceGroups(workspaceId)
    const groupIdSet = new Set(workspaceGroups.map((g) => g.id))
    const partitioned = partitionNotifyIds(ids, groupIdSet)
    const recipients = partitioned.userIds.length > 0 ? partitioned.userIds : undefined
    const groups = partitioned.groupIds.length > 0 ? partitioned.groupIds : undefined
    const workspaceUserList = await getWorkspaceUsers(workspaceId)
    const userMap = new Map(workspaceUserList.map((u) => [u.id, u.name]))
    const groupMap = new Map(workspaceGroups.map((g) => [g.id, g.name]))
    const notified: NotifiedInfo = {
        users: (recipients ?? []).map((id) => ({ id, name: userMap.get(id) ?? `user:${id}` })),
        groups: (groups ?? []).map((id) => ({ id, name: groupMap.get(id) ?? `group:${id}` })),
    }
    return { recipients, groups, notified }
}

export function formatNotifyLabel(items: NamedEntity[]): string {
    return items.map((i) => `${i.name} (${i.id})`).join(', ')
}

export function printNotifyLines(notified: NotifiedInfo): void {
    if (notified.users.length > 0) {
        console.log(`Notify users: ${formatNotifyLabel(notified.users)}`)
    }
    if (notified.groups.length > 0) {
        console.log(`Notify groups: ${formatNotifyLabel(notified.groups)}`)
    }
}
