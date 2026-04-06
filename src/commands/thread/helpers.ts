import chalk from 'chalk'
import type { Group, WorkspaceUser } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { isAccessible } from '../../lib/global-args.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { colors } from '../../lib/output.js'

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

export function pluralize(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`
}

export interface CommentLike {
    id: number
    creator: number
    posted: Date
    content: string
}

export function printComment(
    comment: CommentLike,
    userMap: Map<number, string>,
    raw: boolean,
): void {
    const author = colors.author(userMap.get(comment.creator) || `user:${comment.creator}`)
    const time = colors.timestamp(formatRelativeDate(comment.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${comment.id}`)}`)
    console.log(raw ? comment.content : renderMarkdown(comment.content))
    console.log('')
}

export type NamedEntity = { id: number; name: string }

export interface NotifiedInfo {
    users: NamedEntity[]
    groups: NamedEntity[]
}

export function buildNotifiedInfo(
    userIds: number[] | undefined,
    groupIds: number[] | undefined,
    workspaceUsers: WorkspaceUser[],
    workspaceGroups: Group[],
): NotifiedInfo {
    const userMap = new Map(workspaceUsers.map((u) => [u.id, u.name]))
    const groupMap = new Map(workspaceGroups.map((g) => [g.id, g.name]))
    return {
        users: (userIds ?? []).map((id) => ({ id, name: userMap.get(id) ?? `user:${id}` })),
        groups: (groupIds ?? []).map((id) => ({ id, name: groupMap.get(id) ?? `group:${id}` })),
    }
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
