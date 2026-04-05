import { TwistRequestError } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getSessionUser } from '../../lib/api.js'
import { NoTokenError, getAuthMetadata } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { formatJson } from '../../lib/output.js'

export async function showStatus(options: { json?: boolean }): Promise<void> {
    let user
    try {
        user = await getSessionUser()
    } catch (error) {
        if (error instanceof NoTokenError) throw error
        if (error instanceof TwistRequestError && error.httpStatusCode === 401) {
            throw new CliError('NO_TOKEN', 'Not authenticated (token expired or invalid)', [
                'Run `tw auth login` to re-authenticate',
            ])
        }
        throw error
    }

    if (options.json) {
        console.log(formatJson({ id: user.id, email: user.email, name: user.name }))
        return
    }

    const metadata = await getAuthMetadata()
    const modeLabel =
        metadata.authMode === 'read-only'
            ? `read-only (scope: ${metadata.authScope ?? 'unknown'})`
            : metadata.authMode === 'read-write'
              ? 'read-write'
              : 'unknown (manual token or env var; assuming write access)'

    console.log(chalk.green('✓'), 'Authenticated')
    console.log(`  Email: ${user.email}`)
    console.log(`  Name:  ${user.name}`)
    console.log(`  Mode:  ${modeLabel}`)
}
