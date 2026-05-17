import type { TwistAccount } from './auth-provider.js'
import type { AuthMode } from './config.js'

/**
 * Build a `TwistAccount` from a Twist `getSessionUser` payload plus optional
 * auth metadata. Used by both the OAuth `validateToken` path and the
 * legacy-auth migration path so they can't drift on default values.
 *
 * Lives in its own module so `migrate-auth.ts` can import this helper
 * without pulling in `auth-provider.ts`'s runtime graph (which would
 * re-introduce a cycle).
 */
export function toTwistAccount(
    sessionUser: { id: number; name: string },
    metadata: { authMode?: AuthMode; authScope?: string } = {},
): TwistAccount {
    return {
        id: String(sessionUser.id),
        label: sessionUser.name,
        authMode: metadata.authMode ?? 'unknown',
        authScope: metadata.authScope ?? '',
    }
}
