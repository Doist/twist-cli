import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'
import { formatRelativeDate } from '../lib/dates.js'
import { openEditor, readStdin } from '../lib/input.js'
import { renderMarkdown } from '../lib/markdown.js'
import type { MutationOptions, ViewOptions } from '../lib/options.js'
import { colors, formatJson } from '../lib/output.js'
import { resolveCommentId } from '../lib/refs.js'

type UpdateOptions = MutationOptions

type DeleteOptions = MutationOptions

async function viewComment(ref: string, options: ViewOptions): Promise<void> {
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

async function updateComment(
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
        .description('Thread comment operations (view, update, delete)')

    comment
        .command('view [comment-ref]', { isDefault: true })
        .description('View a single thread comment')
        .option('--raw', 'Show raw markdown instead of rendered')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                comment.help()
                return
            }
            return viewComment(ref, options)
        })

    comment
        .command('update <comment-ref> [content]')
        .description('Update a thread comment')
        .option('--dry-run', 'Show what would be updated without updating')
        .option('--json', 'Output updated comment as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(updateComment)

    comment
        .command('delete <comment-ref>')
        .description('Delete a thread comment')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .action(deleteComment)
}
