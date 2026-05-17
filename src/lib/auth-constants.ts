/**
 * Shared identifiers for the OS keyring. Imported by both the runtime token
 * store (`auth-provider.ts`) and the one-shot migration (`migrate-auth.ts`)
 * so the slot a writer parks a secret in and the slot a reader pulls it from
 * can't drift if either value changes.
 */
export const SECURE_STORE_SERVICE = 'twist-cli'

/**
 * Pre-γ1 single-user keyring slot. `migrateLegacyAuth` deletes this after a
 * successful migration; the runtime token store reads it as a last-resort
 * fallback when migration couldn't complete (e.g. user is offline so
 * `identifyAccount` can't reach Twist).
 */
export const LEGACY_KEYRING_ACCOUNT = 'api-token'
