import chalk from 'chalk'
import { CliError } from '../../lib/errors.js'
import { getInstaller } from '../../lib/skills/index.js'
import type { UpdateOptions } from '../../lib/skills/types.js'
import { updateAllInstalledSkills } from '../../lib/skills/update-installed.js'

export async function updateSkill(agentName: string, options: UpdateOptions): Promise<void> {
    if (agentName === 'all') {
        const result = await updateAllInstalledSkills(options)
        const location = options.local ? 'locally' : 'globally'

        for (const name of result.updated) {
            console.log(chalk.green('✓'), `Updated ${name} ${location}`)
        }
        for (const name of result.skipped) {
            console.log(chalk.dim(`  Skipped ${name} (not installed)`))
        }
        for (const err of result.errors) {
            console.error(chalk.red('✗'), err)
        }

        if (result.updated.length === 0 && result.errors.length === 0) {
            console.log('No skills are currently installed.')
        }

        if (result.errors.length > 0) {
            process.exitCode = 1
        }
        return
    }

    const installer = getInstaller(agentName)

    if (!installer) {
        throw new CliError('UNKNOWN_AGENT', `Unknown agent: ${agentName}`, [
            'Run `tw skill list` to see available agents',
        ])
    }

    await installer.update(options)
    const location = options.local ? 'locally' : 'globally'
    console.log(chalk.green('✓'), `Updated ${agentName} ${location}`)
    console.log(chalk.dim(`  ${installer.getInstallPath(options)}`))
}
