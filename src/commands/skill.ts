import chalk from 'chalk'
import { Command } from 'commander'
import { getInstaller, listAgents } from '../lib/skills/index.js'
import type { InstallOptions, UninstallOptions, UpdateOptions } from '../lib/skills/types.js'
import { updateAllInstalledSkills } from '../lib/skills/update-installed.js'

interface ListOptions {
    local?: boolean
}

async function list(options: ListOptions): Promise<void> {
    const agents = await listAgents(options.local ?? false)

    if (agents.length === 0) {
        console.log('No agents available.')
        return
    }

    const location = options.local ? 'local' : 'global'
    console.log(chalk.bold(`Available agents (${location}):`))
    console.log('')

    for (const agent of agents) {
        const status = agent.installed ? chalk.green('✓ installed') : chalk.dim('not installed')
        console.log(`  ${chalk.bold(agent.name)}  ${status}`)
        console.log(`    ${agent.description}`)
        if (agent.path) {
            console.log(`    ${chalk.dim(agent.path)}`)
        }
        console.log('')
    }
}

async function install(agentName: string, options: InstallOptions): Promise<void> {
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

async function uninstall(agentName: string, options: UninstallOptions): Promise<void> {
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

async function updateSkill(agentName: string, options: UpdateOptions): Promise<void> {
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
        return
    }

    const installer = getInstaller(agentName)

    if (!installer) {
        console.error(`Unknown agent: ${agentName}`)
        console.error('Run `tw skill list` to see available agents.')
        process.exit(1)
    }

    try {
        await installer.update(options)
        const location = options.local ? 'locally' : 'globally'
        console.log(chalk.green('✓'), `Updated ${agentName} ${location}`)
        console.log(chalk.dim(`  ${installer.getInstallPath(options)}`))
    } catch (err) {
        console.error((err as Error).message)
        process.exit(1)
    }
}

export function registerSkillCommand(program: Command): void {
    const skill = program.command('skill').description('Manage agent skill integrations')

    skill
        .command('list')
        .description('List available agents and install status')
        .option('--local', 'Check local installation (./.claude/skills/)')
        .action(list)

    skill
        .command('install <agent>')
        .description('Install an agent skill')
        .option('--local', 'Install locally in project (./.claude/skills/)')
        .option('--force', 'Overwrite existing installation')
        .action(install)

    skill
        .command('update [agent]')
        .description('Update an installed agent skill (defaults to all)')
        .option('--local', 'Update local installation')
        .action((agent: string | undefined, options: UpdateOptions) =>
            updateSkill(agent ?? 'all', options),
        )

    skill
        .command('uninstall <agent>')
        .description('Uninstall an agent skill')
        .option('--local', 'Uninstall from local project')
        .action(uninstall)
}
