import type { TokenStorageResult } from '@doist/cli-core/auth'
import chalk from 'chalk'

/**
 * Surface a `TokenStorageResult` from a save/clear operation: the
 * human-readable confirmation goes to stdout, any keyring-fallback warning
 * goes to stderr. Pass `isMachineOutput: true` when the command is in
 * `--json` / `--ndjson` mode so the stdout confirmation is suppressed and
 * the warning still reaches the operator on stderr.
 */
export function logTokenStorageResult(
    result: TokenStorageResult,
    secureStoreMessage: string,
    isMachineOutput = false,
): void {
    if (!isMachineOutput && result.storage === 'secure-store') {
        console.log(chalk.dim(secureStoreMessage))
    }
    if (result.warning) {
        console.error(chalk.yellow('Warning:'), result.warning)
    }
}
