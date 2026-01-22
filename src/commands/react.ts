import { Command } from 'commander'
import { getTwistClient } from '../lib/api.js'

type TargetType = 'thread' | 'comment' | 'message'

interface ReactOptions {
    dryRun?: boolean
}

function parseTargetId(ref: string): number {
    const id = ref.startsWith('id:') ? ref.slice(3) : ref
    const parsed = parseInt(id, 10)
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid ID: ${ref}`)
    }
    return parsed
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
    const targetId = parseTargetId(targetRef)
    const normalizedEmoji = normalizeEmoji(emoji)

    if (options.dryRun) {
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
    console.log(`Added ${normalizedEmoji} to ${targetType} ${targetId}`)
}

async function removeReaction(
    targetType: TargetType,
    targetRef: string,
    emoji: string,
    options: ReactOptions,
): Promise<void> {
    const targetId = parseTargetId(targetRef)
    const normalizedEmoji = normalizeEmoji(emoji)

    if (options.dryRun) {
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
    console.log(`Removed ${normalizedEmoji} from ${targetType} ${targetId}`)
}

export function registerReactCommand(program: Command): void {
    program
        .command('react <target-type> <target-ref> <emoji>')
        .description('Add an emoji reaction (target-type: thread, comment, message)')
        .option('--dry-run', 'Show what would happen without executing')
        .action((targetType: string, targetRef: string, emoji: string, options: ReactOptions) => {
            if (!['thread', 'comment', 'message'].includes(targetType)) {
                console.error(
                    `Invalid target type: ${targetType}. Use: thread, comment, or message`,
                )
                process.exit(1)
            }
            return addReaction(targetType as TargetType, targetRef, emoji, options)
        })

    program
        .command('unreact <target-type> <target-ref> <emoji>')
        .description('Remove an emoji reaction (target-type: thread, comment, message)')
        .option('--dry-run', 'Show what would happen without executing')
        .action((targetType: string, targetRef: string, emoji: string, options: ReactOptions) => {
            if (!['thread', 'comment', 'message'].includes(targetType)) {
                console.error(
                    `Invalid target type: ${targetType}. Use: thread, comment, or message`,
                )
                process.exit(1)
            }
            return removeReaction(targetType as TargetType, targetRef, emoji, options)
        })
}
