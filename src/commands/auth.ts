import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { Command } from 'commander'
import open from 'open'
import { getSessionUser } from '../lib/api.js'
import {
    clearApiToken,
    getAuthMetadata,
    saveApiToken,
    type TokenStorageResult,
} from '../lib/auth.js'
import {
    buildAuthorizationUrl,
    exchangeCodeForToken,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
    registerDynamicClient,
} from '../lib/oauth.js'
import { startCallbackServer } from '../lib/oauth-server.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce.js'

async function loginWithOAuth(options: { readOnly?: boolean }): Promise<void> {
    const modeLabel = options.readOnly ? 'read-only' : 'read-write'
    console.log(chalk.blue(`Starting OAuth authentication (${modeLabel})...`))

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
                    const authUrl = buildAuthorizationUrl(client.client_id, codeChallenge, state, {
                        readOnly: options.readOnly,
                    })
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

            const saveResult = await saveApiToken(accessToken, {
                authMode: options.readOnly ? 'read-only' : 'read-write',
                authScope: options.readOnly ? READ_ONLY_SCOPES : READ_WRITE_SCOPES,
            })
            console.log(chalk.green('✓'), 'OAuth authentication successful!')
            logTokenStorageResult(
                saveResult,
                'Token stored securely in the system credential manager',
            )
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

function promptHiddenInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        const origWrite = (rl as any)._writeToOutput
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        ;(rl as any)._writeToOutput = (str: string) => {
            if (str.includes(prompt)) {
                origWrite.call(rl, prompt)
            }
        }
        rl.question(prompt, (answer) => {
            rl.close()
            process.stdout.write('\n')
            resolve(answer)
        })
    })
}

async function loginWithToken(token?: string): Promise<void> {
    if (!token) {
        token = await promptHiddenInput('API token: ')
        if (!token.trim()) {
            console.error(chalk.red('Error:'), 'No token provided')
            process.exitCode = 1
            return
        }
    }
    const saveResult = await saveApiToken(token.trim(), { authMode: 'unknown' })
    console.log(chalk.green('✓'), 'API token saved successfully!')
    logTokenStorageResult(saveResult, 'Token stored securely in the system credential manager')
}

async function showStatus(options: { json?: boolean }): Promise<void> {
    try {
        // Try to get session user to verify the token works
        const user = await getSessionUser()
        if (options.json) {
            console.log(
                JSON.stringify({ id: user.id, email: user.email, name: user.name }, null, 2),
            )
            return
        }
        const metadata = await getAuthMetadata()
        const modeLabel =
            metadata.authMode === 'read-only'
                ? `read-only (scope: ${metadata.authScope ?? 'unknown'})`
                : metadata.authMode === 'read-write'
                  ? 'read-write'
                  : 'unknown (manual token or env var; assuming write access)'

        console.log(chalk.green('✓'), 'Authenticated')
        console.log(`  Email: ${user.email}`)
        console.log(`  Name:  ${user.name}`)
        console.log(`  Mode:  ${modeLabel}`)
    } catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'Not authenticated' }, null, 2))
            process.exitCode = 1
            return
        }
        console.log(chalk.yellow('Not authenticated'))
        console.log(
            chalk.dim(
                'Run `tw auth login` for OAuth or `tw auth token <token>` for manual authentication',
            ),
        )
    }
}

async function logout(): Promise<void> {
    const clearResult = await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    logTokenStorageResult(clearResult, 'Stored token removed from the system credential manager')
}

function logTokenStorageResult(result: TokenStorageResult, secureStoreMessage: string): void {
    if (result.storage === 'secure-store') {
        console.log(chalk.dim(secureStoreMessage))
        if (result.warning) {
            console.error(chalk.yellow('Warning:'), result.warning)
        }
        return
    }

    console.error(chalk.yellow('Warning:'), result.warning)
}

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login')
        .description('Authenticate using OAuth (opens browser)')
        .option('--read-only', 'Authenticate with read-only scope (no write operations)')
        .action(loginWithOAuth)

    auth.command('token [token]')
        .description('Save API token for CLI authentication')
        .action(loginWithToken)

    auth.command('status')
        .description('Show current authentication status')
        .option('--json', 'Output as JSON')
        .action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
