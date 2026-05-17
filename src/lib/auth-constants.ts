/** OS keyring `service` identifier for every twist-cli secret. */
export const SECURE_STORE_SERVICE = 'twist-cli'

/**
 * Legacy single-user keyring slot. `migrateLegacyAuth` deletes it after a
 * successful migration; the runtime token store reads it as a last resort
 * when migration can't complete (e.g. offline `identifyAccount`).
 */
export const LEGACY_KEYRING_ACCOUNT = 'api-token'
