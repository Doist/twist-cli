/**
 * OAuth flow coordination for Twist API authentication
 */

import { CliError } from './errors.js'

const AUTH_HINTS = ['Try again: tw auth login', 'Or set TWIST_API_TOKEN environment variable']

// OAuth configuration for Twist (using well-known endpoints with dynamic client registration)
export const AUTHORIZATION_URL = 'https://twist.com/oauth/authorize'
export const TOKEN_URL = 'https://twist.com/oauth/access_token'
export const REGISTRATION_URL = 'https://twist.com/oauth/register'
export const OAUTH_REDIRECT_URI = 'http://localhost:8766/callback'

// OAuth scopes needed for full read-write CLI operations
export const READ_WRITE_SCOPES = [
    'user:read', // Read user information and session details
    'user:write', // Update user settings (e.g. away status)
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

// OAuth scopes for read-only CLI operations (no :write scopes)
export const READ_ONLY_SCOPES = [
    'user:read',
    'workspaces:read',
    'channels:read',
    'threads:read',
    'comments:read',
    'messages:read',
    'reactions:read',
    'search:read',
    'notifications:read',
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
        logo_uri:
            'https://raw.githubusercontent.com/Doist/twist-cli/d65c447ff453eb36af585044c2f5f2f602bcdb34/icons/twist-cli.png',
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
            throw new CliError(
                'AUTH_FAILED',
                `Client registration failed: ${response.status} ${response.statusText} - ${errorText}`,
                AUTH_HINTS,
            )
        }

        const result = await response.json()

        if (!result.client_id || !result.client_secret) {
            throw new CliError(
                'AUTH_FAILED',
                'Invalid client registration response: missing client_id or client_secret',
                AUTH_HINTS,
            )
        }

        return {
            client_id: result.client_id,
            client_secret: result.client_secret,
        }
    } catch (error) {
        if (error instanceof CliError) throw error
        if (error instanceof Error) {
            throw new CliError(
                'AUTH_FAILED',
                `Failed to register OAuth client: ${error.message}`,
                AUTH_HINTS,
            )
        }
        throw new CliError(
            'AUTH_FAILED',
            'Failed to register OAuth client: Unknown error',
            AUTH_HINTS,
        )
    }
}

/**
 * Build the authorization URL for the OAuth flow
 */
export function buildAuthorizationUrl(
    clientId: string,
    codeChallenge: string,
    state: string,
    options: { readOnly?: boolean } = {},
): string {
    const scope = options.readOnly ? READ_ONLY_SCOPES : READ_WRITE_SCOPES
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: OAUTH_REDIRECT_URI,
        scope,
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
            throw new CliError(
                'AUTH_FAILED',
                `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
                AUTH_HINTS,
            )
        }

        const data = await response.json()

        if (data.error) {
            throw new CliError(
                'AUTH_FAILED',
                `OAuth error: ${data.error} - ${data.error_description || 'Unknown error'}`,
                AUTH_HINTS,
            )
        }

        if (!data.access_token) {
            throw new CliError(
                'AUTH_FAILED',
                'No access token received from OAuth server',
                AUTH_HINTS,
            )
        }

        return data.access_token
    } catch (error) {
        if (error instanceof CliError) throw error
        if (error instanceof Error) {
            throw new CliError(
                'AUTH_FAILED',
                `Failed to exchange code for token: ${error.message}`,
                AUTH_HINTS,
            )
        }
        throw new CliError(
            'AUTH_FAILED',
            'Failed to exchange code for token: Unknown error',
            AUTH_HINTS,
        )
    }
}
