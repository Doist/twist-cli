import { getTwistClient } from '../../lib/api.js'
import { CliError } from '../../lib/errors.js'
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
        throw new CliError(
            'MISSING_CONTENT',
            'No content provided. Pass content as an argument or pipe via stdin.',
        )
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
