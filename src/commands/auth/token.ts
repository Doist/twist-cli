import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { createWrappedTwistClient } from '../../lib/api.js'
import { upsertUser } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { isNonInteractive } from '../../lib/global-args.js'
import { logTokenStorageResult } from './helpers.js'

function promptHiddenInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        const origWrite = (rl as any)._writeToOutput
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        ;(rl as any)._writeToOutput = (str: string) => {
            if (str.includes(prompt)) {
                origWrite.call(rl, prompt)
            }
        }
        rl.question(prompt, (answer) => {
            rl.close()
            process.stdout.write('\n')
            resolve(answer)
        })
    })
}

export async function loginWithToken(token?: string): Promise<void> {
    if (!token) {
        if (isNonInteractive()) {
            throw new CliError(
                'NO_TOKEN',
                'Cannot prompt for token in non-interactive mode. Set the TWIST_API_TOKEN environment variable instead.',
            )
        }
        token = await promptHiddenInput('API token: ')
        if (!token.trim()) {
            throw new CliError('NO_TOKEN', 'No token provided', [
                'Run: tw auth token (interactive prompt)',
                'Or set TWIST_API_TOKEN environment variable',
                'Or use OAuth: tw auth login',
            ])
        }
    }
    const trimmed = token.trim()

    // Identify the user behind the token so it lands in the right slot.
    let user: { id: number; name: string; email: string }
    try {
        const probe = createWrappedTwistClient(trimmed)
        user = await probe.users.getSessionUser()
    } catch (error) {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
        throw new CliError('INVALID_TOKEN', `Could not verify the token against Twist${detail}`, [
            'Check the token is correct',
            'Use `tw auth login` for OAuth instead',
        ])
    }

    const result = await upsertUser({
        id: String(user.id),
        email: user.email,
        name: user.name,
        token: trimmed,
        authMode: 'unknown',
    })

    const verb = result.replaced ? 'Updated stored token for' : 'Saved token for'
    console.log(chalk.green('✓'), `${verb} ${user.email}`)
    logTokenStorageResult(result, 'Token stored securely in the system credential manager')
}
