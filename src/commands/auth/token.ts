import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { saveApiToken } from '../../lib/auth.js'
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
            throw new CliError('NO_TOKEN', 'No token provided')
        }
    }
    const saveResult = await saveApiToken(token.trim(), { authMode: 'unknown' })
    console.log(chalk.green('✓'), 'API token saved successfully!')
    logTokenStorageResult(saveResult, 'Token stored securely in the system credential manager')
}
