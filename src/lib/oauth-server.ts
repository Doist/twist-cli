import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parse } from 'node:url'

export const PORT = 8766
export const OAUTH_REDIRECT_URI = 'http://localhost:8766/callback'

// 3 minute timeout for OAuth flow
const TIMEOUT_MS = 3 * 60 * 1000

interface CallbackResult {
    code: string
    cleanup: () => void
}

/**
 * Start a local HTTP server to handle OAuth callback
 * Returns a promise that resolves when the callback is received with valid state
 */
export async function startCallbackServer(expectedState: string): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
        let server: Server | null = null
        let timeoutId: NodeJS.Timeout | null = null
        let resolved = false

        const cleanup = () => {
            if (resolved) return
            resolved = true

            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }

            if (server) {
                server.close()
                server = null
            }
        }

        // Set up timeout
        timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('OAuth flow timed out. Please try again.'))
        }, TIMEOUT_MS)

        // Create HTTP server
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
            const url = parse(req.url || '', true)

            if (url.pathname === '/callback') {
                handleCallback(req, res, expectedState, resolve, reject, cleanup)
            } else {
                // Handle other paths
                res.writeHead(404, { 'Content-Type': 'text/html' })
                res.end(getNotFoundPage())
            }
        })

        // Handle server errors
        server.on('error', (error) => {
            cleanup()
            if (error.message.includes('EADDRINUSE')) {
                reject(
                    new Error(
                        `Port ${PORT} is already in use. Please close any other applications using this port and try again.`,
                    ),
                )
            } else {
                reject(new Error(`Server error: ${error.message}`))
            }
        })

        // Start listening
        server.listen(PORT, 'localhost', () => {
            console.log(`OAuth callback server listening on ${OAUTH_REDIRECT_URI}`)
        })
    })
}

function handleCallback(
    req: IncomingMessage,
    res: ServerResponse,
    expectedState: string,
    resolve: (result: CallbackResult) => void,
    reject: (error: Error) => void,
    cleanup: () => void,
) {
    const url = parse(req.url || '', true)
    const { code, state, error, error_description } = url.query

    // Check for OAuth errors first
    if (error) {
        const errorMsg = error_description ? String(error_description) : String(error)
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(getErrorPage(`OAuth Error: ${errorMsg}`))
        cleanup()
        reject(new Error(`OAuth authorization failed: ${errorMsg}`))
        return
    }

    // Validate state parameter (CSRF protection)
    if (!state || String(state) !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(getErrorPage('Invalid state parameter. This may be a security issue.'))
        cleanup()
        reject(new Error('Invalid state parameter received. Possible CSRF attack.'))
        return
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(getErrorPage('No authorization code received.'))
        cleanup()
        reject(new Error('No authorization code received from OAuth server'))
        return
    }

    // Success!
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(getSuccessPage())

    resolve({
        code: String(code),
        cleanup,
    })
}

function getSuccessPage(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Authorization Successful - Twist CLI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
        .message { color: #333; font-size: 16px; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">✅ Authorization Successful!</div>
        <div class="message">
            You have successfully authorized Twist CLI. You can now close this window and return to your terminal.
        </div>
    </div>
</body>
</html>`
}

function getErrorPage(errorMessage: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Authorization Error - Twist CLI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
        .message { color: #333; font-size: 16px; line-height: 1.5; margin-bottom: 20px; }
        .instructions { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">❌ Authorization Failed</div>
        <div class="message">${errorMessage}</div>
        <div class="instructions">
            Please close this window and try running the login command again in your terminal.
        </div>
    </div>
</body>
</html>`
}

function getNotFoundPage(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Page Not Found - Twist CLI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .message { color: #333; font-size: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="message">This is the OAuth callback server for Twist CLI. This page should only be accessed during the login process.</div>
    </div>
</body>
</html>`
}
