import type { TwistAccount } from './auth-provider.js'
import type { AuthMode } from './config.js'

/** Canonical `TwistAccount` factory. Applies the `'unknown'` / `''` defaults. */
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
 * Adapt a Twist `getSessionUser` payload to a `TwistAccount`. Lives in its
 * own module so `migrate-auth.ts` can import it without pulling in
 * `auth-provider.ts`'s runtime graph.
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
