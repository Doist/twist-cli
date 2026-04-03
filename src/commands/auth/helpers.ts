import chalk from 'chalk'
import type { TokenStorageResult } from '../../lib/auth.js'

export function logTokenStorageResult(
    result: TokenStorageResult,
    secureStoreMessage: string,
): void {
    if (result.storage === 'secure-store') {
        console.log(chalk.dim(secureStoreMessage))
        if (result.warning) {
            console.error(chalk.yellow('Warning:'), result.warning)
        }
        return
    }

    console.error(chalk.yellow('Warning:'), result.warning)
}
