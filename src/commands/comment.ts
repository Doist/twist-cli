import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'
import { openEditor, readStdin } from '../lib/input.js'
import type { MutationOptions } from '../lib/options.js'
import { formatJson } from '../lib/output.js'
import { resolveCommentId } from '../lib/refs.js'

type EditOptions = MutationOptions

type DeleteOptions = MutationOptions

async function editComment(
    ref: string,
    content: string | undefined,
    options: EditOptions,
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

async function deleteComment(ref: string, options: DeleteOptions): Promise<void> {
    const commentId = resolveCommentId(ref)

    if (options.dryRun) {
        console.log(`Dry run: would delete comment ${commentId}`)
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

export function registerCommentCommand(program: Command): void {
    const comment = program
        .command('comment')
        .description('Thread comment operations (edit, delete)')

    comment
        .command('edit <comment-ref> [content]')
        .description('Edit a thread comment')
        .option('--dry-run', 'Show what would be updated without updating')
        .option('--json', 'Output updated comment as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(editComment)

    comment
        .command('delete <comment-ref>')
        .description('Delete a thread comment')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .action(deleteComment)
}
