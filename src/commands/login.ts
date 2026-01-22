import chalk from 'chalk'
import { Command } from 'commander'
import { saveApiToken } from '../lib/auth.js'
import { getConfigPath } from '../lib/config.js'

async function loginWithToken(token: string): Promise<void> {
    // Save token to config
    await saveApiToken(token.trim())

    console.log(chalk.green('✓'), 'API token saved successfully!')
    console.log(chalk.dim(`Token saved to ${getConfigPath()}`))
}

export function registerLoginCommand(program: Command): void {
    const login = program.command('login').description('Authenticate with Twist')

    login
        .command('token <token>')
        .description('Save API token to config file')
        .action(loginWithToken)
}
