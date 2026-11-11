import chalk from 'chalk'

/** The npm package `tw` is published under from v4 onwards. */
export const NEW_PACKAGE_NAME = '@todoist/twist-cli'

export const MOVED_NOTICE = `tw has moved to ${NEW_PACKAGE_NAME}. Run "tw update" to switch.`

/**
 * `@doist/twist-cli` gets no further releases, so tell its users on every run
 * where the CLI went. Only written to an interactive stderr so JSON/NDJSON
 * output, pipes and agents are unaffected, and skipped for `tw update`, which
 * explains the move itself while it switches packages.
 */
export function printMovedNotice(commandName: string | undefined): void {
    if (!process.stderr.isTTY || commandName === 'update') return
    process.stderr.write(`${chalk.yellow(MOVED_NOTICE)}\n`)
}
