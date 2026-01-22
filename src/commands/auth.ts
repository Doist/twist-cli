import chalk from 'chalk'
import { Command } from 'commander'
import open from 'open'
import { getSessionUser } from '../lib/api.js'
import { clearApiToken, saveApiToken } from '../lib/auth.js'
import { getConfigPath } from '../lib/config.js'
import { buildAuthorizationUrl, exchangeCodeForToken, registerDynamicClient } from '../lib/oauth.js'
import { startCallbackServer } from '../lib/oauth-server.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce.js'

async function loginWithOAuth(): Promise<void> {
    console.log(chalk.blue('Starting OAuth authentication...'))

    try {
        // Register dynamic client
        console.log(chalk.dim('Registering OAuth client...'))
        const client = await registerDynamicClient()

        // Generate PKCE parameters
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = generateCodeChallenge(codeVerifier)
        const state = generateState()

        // Start callback server
        console.log(chalk.dim('Starting local callback server...'))

        let cleanup: (() => void) | undefined
        try {
            // Open browser in background after a delay
            setTimeout(async () => {
                try {
                    const authUrl = buildAuthorizationUrl(client.client_id, codeChallenge, state)
                    console.log(chalk.dim('Opening browser for authorization...'))
                    console.log(chalk.dim(`If the browser doesn't open, visit: ${authUrl}`))
                    await open(authUrl)
                } catch {
                    // Browser opening failure is not critical - user can use the URL manually
                }
            }, 1000)

            // Wait for callback - this gives us both code and cleanup
            const result = await startCallbackServer(state)
            cleanup = result.cleanup

            console.log(chalk.dim('Exchanging authorization code for token...'))
            const accessToken = await exchangeCodeForToken(result.code, codeVerifier, client)

            // Save token using existing logic
            await saveApiToken(accessToken)

            console.log(chalk.green('✓'), 'OAuth authentication successful!')
            console.log(chalk.dim(`Token saved to ${getConfigPath()}`))
        } finally {
            // Always cleanup the server
            if (cleanup) {
                cleanup()
            }
        }
    } catch (error) {
        console.log(chalk.red('✗'), 'OAuth authentication failed')
        console.log(chalk.dim(error instanceof Error ? error.message : 'Unknown error'))
        console.log(chalk.dim('You can try manual authentication with `tw auth token <token>`'))
    }
}

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
        console.log(
            chalk.dim(
                'Run `tw auth login` for OAuth or `tw auth token <token>` for manual authentication',
            ),
        )
    }
}

async function logout(): Promise<void> {
    await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    console.log(chalk.dim(`Token removed from ${getConfigPath()}`))
}

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login')
        .description('Authenticate using OAuth (opens browser)')
        .action(loginWithOAuth)

    auth.command('token <token>')
        .description('Save API token to config file (manual method)')
        .action(loginWithToken)

    auth.command('status').description('Show current authentication status').action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
