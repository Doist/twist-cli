import chalk from 'chalk'
import { getSessionUser } from '../../lib/api.js'
import { getAuthMetadata } from '../../lib/auth.js'

export async function showStatus(options: { json?: boolean }): Promise<void> {
    try {
        // Try to get session user to verify the token works
        const user = await getSessionUser()
        if (options.json) {
            console.log(
                JSON.stringify({ id: user.id, email: user.email, name: user.name }, null, 2),
            )
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
    } catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'Not authenticated' }, null, 2))
            process.exitCode = 1
            return
        }
        console.log(chalk.yellow('Not authenticated'))
        console.log(
            chalk.dim(
                'Run `tw auth login` for OAuth or `tw auth token <token>` for manual authentication',
            ),
        )
    }
}
