/**
 * OAuth flow coordination for Twist API authentication
 */

// OAuth configuration for Twist (using well-known endpoints with dynamic client registration)
export const AUTHORIZATION_URL = 'https://twist.com/oauth/authorize'
export const TOKEN_URL = 'https://twist.com/oauth/access_token'
export const REGISTRATION_URL = 'https://twist.com/oauth/register'
export const OAUTH_REDIRECT_URI = 'http://localhost:8766/callback'

// OAuth scopes needed for the CLI operations
export const OAUTH_SCOPES = [
    'user:read', // Read user information and session details
    'workspaces:read', // Read workspace information
    'channels:read', // Read channel information
    'threads:read', // Read thread information
    'threads:write', // Create and manage threads
    'comments:read', // Read comments/messages
    'comments:write', // Send comments/messages
    'messages:read', // Read messages
    'messages:write', // Send messages
    'reactions:read', // Read reactions
    'reactions:write', // Add reactions
    'search:read', // Search functionality
    'notifications:read', // Read notifications
].join(' ')

/**
 * OAuth client credentials from dynamic registration
 */
export interface OAuthClient {
    client_id: string
    client_secret: string
}

/**
 * Register a dynamic OAuth client for this CLI session
 */
export async function registerDynamicClient(): Promise<OAuthClient> {
    const clientData = {
        client_name: 'Twist CLI',
        client_uri: 'https://github.com/doist/twist-cli',
        redirect_uris: [OAUTH_REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic', // Use Basic auth for token exchange
        application_type: 'native', // CLI is a native application
        logo_uri: 'https://todoist.b-cdn.net/agentist-icons/service_twist_color_72px.svg',
    }

    try {
        const response = await fetch(REGISTRATION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(clientData),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
                `Client registration failed: ${response.status} ${response.statusText} - ${errorText}`,
            )
        }

        const result = await response.json()

        if (!result.client_id || !result.client_secret) {
            throw new Error(
                'Invalid client registration response: missing client_id or client_secret',
            )
        }

        return {
            client_id: result.client_id,
            client_secret: result.client_secret,
        }
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to register OAuth client: ${error.message}`)
        }
        throw new Error('Failed to register OAuth client: Unknown error')
    }
}

/**
 * Build the authorization URL for the OAuth flow
 */
export function buildAuthorizationUrl(
    clientId: string,
    codeChallenge: string,
    state: string,
): string {
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: OAUTH_REDIRECT_URI,
        scope: OAUTH_SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    })

    return `${AUTHORIZATION_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for access token using PKCE
 */
export async function exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    client: OAuthClient,
): Promise<string> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
        code_verifier: codeVerifier,
    })

    // Use HTTP Basic Authentication for client credentials
    const credentials = `${client.client_id}:${client.client_secret}`
    const encodedCredentials = btoa(credentials)

    try {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                Authorization: `Basic ${encodedCredentials}`,
            },
            body: body.toString(),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
                `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
            )
        }

        const data = await response.json()

        if (data.error) {
            throw new Error(
                `OAuth error: ${data.error} - ${data.error_description || 'Unknown error'}`,
            )
        }

        if (!data.access_token) {
            throw new Error('No access token received from OAuth server')
        }

        return data.access_token
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to exchange code for token: ${error.message}`)
        }
        throw new Error('Failed to exchange code for token: Unknown error')
    }
}
