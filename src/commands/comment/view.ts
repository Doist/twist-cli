import { getTwistClient } from '../../lib/api.js'
import { formatRelativeDate } from '../../lib/dates.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson } from '../../lib/output.js'
import { resolveCommentId } from '../../lib/refs.js'

export async function viewComment(ref: string, options: ViewOptions): Promise<void> {
    const commentId = resolveCommentId(ref)
    const client = await getTwistClient()
    const comment = await client.comments.getComment(commentId)

    const userResponse = await client.workspaceUsers.getUserById(
        { workspaceId: comment.workspaceId, userId: comment.creator },
        { batch: false },
    )
    const creatorName = userResponse.name

    if (options.json) {
        const output = { ...comment, creatorName }
        console.log(formatJson(output, options.full ? undefined : 'comment', options.full))
        return
    }

    const author = colors.author(creatorName)
    const time = colors.timestamp(formatRelativeDate(comment.posted))
    console.log(`${author}  ${time}  ${colors.timestamp(`id:${comment.id}`)}`)
    console.log(options.raw ? comment.content : renderMarkdown(comment.content))
    console.log('')
}
