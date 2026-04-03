import { getTwistClient } from '../../lib/api.js'
import { openEditor, readStdin } from '../../lib/input.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { resolveCommentId } from '../../lib/refs.js'

type UpdateOptions = MutationOptions

export async function updateComment(
    ref: string,
    content: string | undefined,
    options: UpdateOptions,
): Promise<void> {
    const commentId = resolveCommentId(ref)

    let newContent = await readStdin()
    if (!newContent && content) {
        newContent = content
    }
    if (!newContent) {
        newContent = await openEditor()
    }
    if (!newContent || newContent.trim() === '') {
        console.error('No content provided.')
        process.exit(1)
    }

    if (options.dryRun) {
        console.log(`Dry run: would update comment ${commentId}`)
        console.log('')
        console.log(newContent)
        return
    }

    const client = await getTwistClient()
    const comment = await client.comments.updateComment({
        id: commentId,
        content: newContent,
    })

    if (options.json) {
        console.log(formatJson(comment, 'comment', options.full))
        return
    }

    console.log(`Comment updated: ${comment.url}`)
}
