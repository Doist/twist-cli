import chalk from 'chalk'
import { getInstaller } from '../../lib/skills/index.js'
import type { InstallOptions } from '../../lib/skills/types.js'

export async function install(agentName: string, options: InstallOptions): Promise<void> {
    const installer = getInstaller(agentName)

    if (!installer) {
        console.error(`Unknown agent: ${agentName}`)
        console.error('Run `tw skill list` to see available agents.')
        process.exit(1)
    }

    try {
        await installer.install(options)
        const location = options.local ? 'locally' : 'globally'
        console.log(chalk.green('✓'), `Installed ${agentName} ${location}`)
        console.log(chalk.dim(`  ${installer.getInstallPath(options)}`))
    } catch (err) {
        console.error((err as Error).message)
        process.exit(1)
    }
}
