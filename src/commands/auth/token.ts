import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { createWrappedTwistClient } from '../../lib/api.js'
import { upsertAccount } from '../../lib/auth.js'
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

    // Identify the Twist user behind the token so it lands in the right slot.
    const probeApi = createWrappedTwistClient(trimmed)
    const sessionUser = await probeApi.users.getSessionUser()
    const userId = String(sessionUser.id)

    const saveResult = await upsertAccount({
        id: userId,
        email: sessionUser.email,
        name: sessionUser.name,
        token: trimmed,
        authMode: 'unknown',
    })

    const verb = saveResult.replaced ? 'Updated stored token for' : 'Saved token for'
    console.log(chalk.green('✓'), `${verb} ${sessionUser.email}`)
    logTokenStorageResult(saveResult, 'Token stored securely in the system credential manager')
}
