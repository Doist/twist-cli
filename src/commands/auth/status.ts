import chalk from 'chalk'
import { getSessionUser } from '../../lib/api.js'
import { getAuthMetadata } from '../../lib/auth.js'
import { formatJson } from '../../lib/output.js'

export async function showStatus(options: { json?: boolean }): Promise<void> {
    const user = await getSessionUser()

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
