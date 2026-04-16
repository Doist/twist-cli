import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions } from '../../lib/options.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveCommentId } from '../../lib/refs.js'

type DeleteOptions = MutationOptions

export async function deleteComment(ref: string, options: DeleteOptions): Promise<void> {
    const commentId = resolveCommentId(ref)

    if (options.dryRun) {
        printDryRun('delete comment', {
            Comment: String(commentId),
        })
        return
    }

    const client = await getTwistClient()
    await client.comments.deleteComment(commentId)

    if (options.json) {
        console.log(formatJson({ id: commentId, deleted: true }))
        return
    }

    console.log(`Comment ${commentId} deleted.`)
}
