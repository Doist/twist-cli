import chalk from 'chalk'
import { clearApiToken } from '../../lib/auth.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { logTokenStorageResult } from './helpers.js'

export async function logout(): Promise<void> {
    const clearResult = await clearApiToken({ ref: getRequestedUserRef() })
    console.log(chalk.green('✓'), 'Logged out')
    logTokenStorageResult(clearResult, 'Stored token removed from the system credential manager')
}
