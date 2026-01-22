import chalk from 'chalk'
import { Command } from 'commander'
import { getSessionUser } from '../lib/api.js'
import { clearApiToken, saveApiToken } from '../lib/auth.js'
import { getConfigPath } from '../lib/config.js'

async function loginWithToken(token: string): Promise<void> {
    // Save token to config
    await saveApiToken(token.trim())

    console.log(chalk.green('✓'), 'API token saved successfully!')
    console.log(chalk.dim(`Token saved to ${getConfigPath()}`))
}

async function showStatus(): Promise<void> {
    try {
        // Try to get session user to verify the token works
        const user = await getSessionUser()

        console.log(chalk.green('✓'), 'Authenticated')
        console.log(`  Email: ${user.email}`)
        console.log(`  Name:  ${user.name}`)
    } catch {
        console.log(chalk.yellow('Not authenticated'))
        console.log(chalk.dim('Run `tw auth token <token>` to authenticate'))
    }
}

async function logout(): Promise<void> {
    await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    console.log(chalk.dim(`Token removed from ${getConfigPath()}`))
}

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('token <token>')
        .description('Save API token to config file')
        .action(loginWithToken)

    auth.command('status').description('Show current authentication status').action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
