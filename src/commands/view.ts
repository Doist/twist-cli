import { Command } from 'commander'
import { classifyTwistUrl } from '../lib/refs.js'

function looksLikeTwistAppUrl(token: string): boolean {
    return /^https?:\/\/twist\.com\/a\/\S+/.test(token)
}

function extractViewInvocation(parsedUrl: string): {
    url: string
    passthroughArgs: string[]
} {
    const rawArgs = process.argv
    const viewIdx = rawArgs.indexOf('view')
    const afterView = viewIdx >= 0 ? rawArgs.slice(viewIdx + 1) : []
    const passthroughArgs = afterView.filter((arg: string) => arg !== parsedUrl)
    return { url: parsedUrl, passthroughArgs }
}

async function runRoutedCommand(
    loadRegister: () => Promise<(p: Command) => void>,
    argv: string[],
): Promise<void> {
    const proxy = new Command()
    proxy.exitOverride()
    const register = await loadRegister()
    register(proxy)
    await proxy.parseAsync(['node', 'tw', ...argv])
}

export function registerViewCommand(program: Command): void {
    program
        .command('view <url> [args...]')
        .description('View any Twist entity by URL')
        .allowUnknownOption(true)
        .addHelpText(
            'after',
            `
Route mapping:
  Message URL      → tw msg view <url>
  Conversation URL → tw conversation view <url>
  Comment URL      → tw thread view <url>  (comment ID extracted from URL)
  Thread URL       → tw thread view <url>

Examples:
  tw view https://twist.com/a/1585/ch/100/t/200
  tw view https://twist.com/a/1585/ch/100/t/200/c/300
  tw view https://twist.com/a/1585/msg/400
  tw view https://twist.com/a/1585/msg/400/m/500
  tw view https://twist.com/a/1585/msg/400/m/500 --json`,
        )
        .action(async (url: string) => {
            if (!looksLikeTwistAppUrl(url)) {
                throw new Error(`Not a recognized Twist URL: ${url}`)
            }

            const { url: resolvedUrl, passthroughArgs } = extractViewInvocation(url)

            const route = classifyTwistUrl(resolvedUrl)
            if (!route) {
                throw new Error(`Not a recognized Twist URL: ${resolvedUrl}`)
            }

            switch (route.entityType) {
                case 'thread':
                    await runRoutedCommand(
                        async () => (await import('./thread/index.js')).registerThreadCommand,
                        ['thread', 'view', resolvedUrl, ...passthroughArgs],
                    )
                    break
                case 'comment':
                    await runRoutedCommand(
                        async () => (await import('./thread/index.js')).registerThreadCommand,
                        ['thread', 'view', resolvedUrl, ...passthroughArgs],
                    )
                    break
                case 'conversation':
                    await runRoutedCommand(
                        async () =>
                            (await import('./conversation/index.js')).registerConversationCommand,
                        ['conversation', 'view', resolvedUrl, ...passthroughArgs],
                    )
                    break
                case 'message':
                    await runRoutedCommand(
                        async () => (await import('./msg/index.js')).registerMsgCommand,
                        ['msg', 'view', resolvedUrl, ...passthroughArgs],
                    )
                    break
            }
        })
}
