import chalk from 'chalk'
import { formatRelativeDate } from '../../lib/dates.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { colors, isAccessible } from '../../lib/output.js'

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
