import type { TwistAccount } from './auth-provider.js'
import type { AuthMode } from './config.js'

/**
 * Lower-level factory: applies the canonical `authMode` / `authScope`
 * defaults (`'unknown'` / `''`) to whatever id/label the caller already
 * has. Used by every code path that constructs a `TwistAccount` —
 * OAuth `validateToken`, `migrateLegacyAuth`'s `identifyAccount`, the
 * user-records read-side, and the offline legacy fallback — so the
 * defaults can't drift between them.
 */
export function makeTwistAccount(input: {
    id: string
    label: string
    authMode?: AuthMode
    authScope?: string
}): TwistAccount {
    return {
        id: input.id,
        label: input.label,
        authMode: input.authMode ?? 'unknown',
        authScope: input.authScope ?? '',
    }
}

/**
 * Build a `TwistAccount` from a Twist `getSessionUser` payload plus optional
 * auth metadata. Thin convenience wrapper around `makeTwistAccount` for the
 * common case where the caller has a fresh session-user response.
 *
 * Lives in its own module so `migrate-auth.ts` can import this helper
 * without pulling in `auth-provider.ts`'s runtime graph (which would
 * re-introduce a cycle).
 */
export function toTwistAccount(
    sessionUser: { id: number; name: string },
    metadata: { authMode?: AuthMode; authScope?: string } = {},
): TwistAccount {
    return makeTwistAccount({
        id: String(sessionUser.id),
        label: sessionUser.name,
        authMode: metadata.authMode,
        authScope: metadata.authScope,
    })
}
