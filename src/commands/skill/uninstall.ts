import chalk from 'chalk'
import { getInstaller } from '../../lib/skills/index.js'
import type { UninstallOptions } from '../../lib/skills/types.js'

export async function uninstall(agentName: string, options: UninstallOptions): Promise<void> {
    const installer = getInstaller(agentName)

    if (!installer) {
        console.error(`Unknown agent: ${agentName}`)
        process.exit(1)
    }

    try {
        await installer.uninstall(options)
        const location = options.local ? 'locally' : 'globally'
        console.log(chalk.green('✓'), `Uninstalled ${agentName} ${location}`)
    } catch (err) {
        console.error((err as Error).message)
        process.exit(1)
    }
}
