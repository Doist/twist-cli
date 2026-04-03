import chalk from 'chalk'
import { listAgents } from '../../lib/skills/index.js'

interface ListOptions {
    local?: boolean
}

export async function list(options: ListOptions): Promise<void> {
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
