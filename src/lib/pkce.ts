import { createHash, randomBytes } from 'node:crypto'

/**
 * Generate a cryptographically secure random code verifier for PKCE.
 * Returns a base64url-encoded string with 43-128 characters.
 */
export function generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits) which gives us 43 base64url characters
    const buffer = randomBytes(32)
    return base64urlEncode(buffer)
}

/**
 * Generate a code challenge from a code verifier using SHA256 and base64url encoding.
 * This is the S256 method as specified in RFC 7636.
 */
export function generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest()
    return base64urlEncode(hash)
}

/**
 * Generate a cryptographically secure random state parameter for CSRF protection.
 * Returns a base64url-encoded string.
 */
export function generateState(): string {
    // Generate 16 random bytes (128 bits) for the state parameter
    const buffer = randomBytes(16)
    return base64urlEncode(buffer)
}

/**
 * Base64url encode a buffer (RFC 4648 Section 5).
 * This removes padding and uses URL-safe characters.
 */
function base64urlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
