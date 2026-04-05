import chalk from 'chalk'
import { CliError } from '../../lib/errors.js'
import { getInstaller } from '../../lib/skills/index.js'
import type { UninstallOptions } from '../../lib/skills/types.js'

export async function uninstall(agentName: string, options: UninstallOptions): Promise<void> {
    const installer = getInstaller(agentName)

    if (!installer) {
        throw new CliError('UNKNOWN_AGENT', `Unknown agent: ${agentName}`, [
            'Run `tw skill list` to see available agents',
        ])
    }

    await installer.uninstall(options)
    const location = options.local ? 'locally' : 'globally'
    console.log(chalk.green('✓'), `Uninstalled ${agentName} ${location}`)
}
