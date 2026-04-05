import chalk from 'chalk'
import { CliError } from '../../lib/errors.js'
import { getInstaller } from '../../lib/skills/index.js'
import type { InstallOptions } from '../../lib/skills/types.js'

export async function install(agentName: string, options: InstallOptions): Promise<void> {
    const installer = getInstaller(agentName)

    if (!installer) {
        throw new CliError('UNKNOWN_AGENT', `Unknown agent: ${agentName}`, [
            'Run `tw skill list` to see available agents',
        ])
    }

    await installer.install(options)
    const location = options.local ? 'locally' : 'globally'
    console.log(chalk.green('✓'), `Installed ${agentName} ${location}`)
    console.log(chalk.dim(`  ${installer.getInstallPath(options)}`))
}
