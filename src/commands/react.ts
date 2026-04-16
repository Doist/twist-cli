import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'
import { CliError } from '../lib/errors.js'
import type { MutationOptions } from '../lib/options.js'
import { formatJson } from '../lib/output.js'
import { resolveCommentId, resolveMessageId, resolveThreadId } from '../lib/refs.js'

type TargetType = 'thread' | 'comment' | 'message'

type ReactOptions = MutationOptions

function resolveTargetId(targetType: TargetType, targetRef: string): number {
    if (targetType === 'thread') {
        return resolveThreadId(targetRef)
    }
    if (targetType === 'comment') {
        return resolveCommentId(targetRef)
    }
    return resolveMessageId(targetRef)
}

function normalizeEmoji(emoji: string): string {
    const shortcodeMap: Record<string, string> = {
        '+1': '👍',
        '-1': '👎',
        heart: '❤️',
        tada: '🎉',
        smile: '😊',
        laughing: '😂',
        thinking: '🤔',
        fire: '🔥',
        check: '✅',
        x: '❌',
        eyes: '👀',
        pray: '🙏',
        clap: '👏',
        rocket: '🚀',
        wave: '👋',
    }

    return shortcodeMap[emoji.toLowerCase()] || emoji
}

async function addReaction(
    targetType: TargetType,
    targetRef: string,
    emoji: string,
    options: ReactOptions,
): Promise<void> {
    const targetId = resolveTargetId(targetType, targetRef)
    const normalizedEmoji = normalizeEmoji(emoji)

    if (options.dryRun) {
        if (options.json) {
            console.log(
                formatJson({
                    targetType,
                    targetId,
                    emoji: normalizedEmoji,
                    action: 'added',
                    dryRun: true,
                }),
            )
            return
        }
        console.log(`Dry run: would add ${normalizedEmoji} to ${targetType} ${targetId}`)
        return
    }

    const client = await getTwistClient()

    const params: { threadId?: number; commentId?: number; messageId?: number; reaction: string } =
        {
            reaction: normalizedEmoji,
        }

    if (targetType === 'thread') {
        params.threadId = targetId
    } else if (targetType === 'comment') {
        params.commentId = targetId
    } else {
        params.messageId = targetId
    }

    await client.reactions.add(params)

    if (options.json) {
        console.log(formatJson({ targetType, targetId, emoji: normalizedEmoji, action: 'added' }))
        return
    }

    console.log(`Added ${normalizedEmoji} to ${targetType} ${targetId}`)
}

async function removeReaction(
    targetType: TargetType,
    targetRef: string,
    emoji: string,
    options: ReactOptions,
): Promise<void> {
    const targetId = resolveTargetId(targetType, targetRef)
    const normalizedEmoji = normalizeEmoji(emoji)

    if (options.dryRun) {
        if (options.json) {
            console.log(
                formatJson({
                    targetType,
                    targetId,
                    emoji: normalizedEmoji,
                    action: 'removed',
                    dryRun: true,
                }),
            )
            return
        }
        console.log(`Dry run: would remove ${normalizedEmoji} from ${targetType} ${targetId}`)
        return
    }

    const client = await getTwistClient()

    const params: { threadId?: number; commentId?: number; messageId?: number; reaction: string } =
        {
            reaction: normalizedEmoji,
        }

    if (targetType === 'thread') {
        params.threadId = targetId
    } else if (targetType === 'comment') {
        params.commentId = targetId
    } else {
        params.messageId = targetId
    }

    await client.reactions.remove(params)

    if (options.json) {
        console.log(formatJson({ targetType, targetId, emoji: normalizedEmoji, action: 'removed' }))
        return
    }

    console.log(`Removed ${normalizedEmoji} from ${targetType} ${targetId}`)
}

export function registerReactCommand(program: Command): void {
    program
        .command('react <target-type> <target-ref> <emoji>')
        .description('Add an emoji reaction (target-type: thread, comment, message)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw react thread 12345 +1
  tw react comment 67890 heart
  tw react message 11111 tada --dry-run
  tw react thread 12345 +1 --json`,
        )
        .action((targetType: string, targetRef: string, emoji: string, options: ReactOptions) => {
            if (!['thread', 'comment', 'message'].includes(targetType)) {
                throw new CliError(
                    'INVALID_TYPE',
                    `Invalid target type: ${targetType}. Use: thread, comment, or message`,
                )
            }
            return addReaction(targetType as TargetType, targetRef, emoji, options)
        })

    program
        .command('unreact <target-type> <target-ref> <emoji>')
        .description('Remove an emoji reaction (target-type: thread, comment, message)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output result as JSON')
        .addHelpText(
            'after',
            `
Examples:
  tw unreact thread 12345 +1
  tw unreact comment 67890 heart
  tw unreact thread 12345 +1 --json`,
        )
        .action((targetType: string, targetRef: string, emoji: string, options: ReactOptions) => {
            if (!['thread', 'comment', 'message'].includes(targetType)) {
                throw new CliError(
                    'INVALID_TYPE',
                    `Invalid target type: ${targetType}. Use: thread, comment, or message`,
                )
            }
            return removeReaction(targetType as TargetType, targetRef, emoji, options)
        })
}
