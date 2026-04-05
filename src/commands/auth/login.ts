import chalk from 'chalk'
import { saveApiToken } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { startCallbackServer } from '../../lib/oauth-server.js'
import {
    buildAuthorizationUrl,
    exchangeCodeForToken,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
    registerDynamicClient,
} from '../../lib/oauth.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce.js'
import { logTokenStorageResult } from './helpers.js'

export async function loginWithOAuth(options: { readOnly?: boolean }): Promise<void> {
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
            const open = (await import('open')).default

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
        if (error instanceof CliError) throw error
        const detail = error instanceof Error ? `: ${error.message}` : ''
        throw new CliError('AUTH_FAILED', `OAuth authentication failed${detail}`, [
            'Try again: tw auth login',
            'Or use manual authentication: tw auth token <token>',
        ])
    }
}
