import type { AccountRef } from '@doist/cli-core/auth'
import { matchTwistAccount, type TwistTokenStore } from '../../lib/auth-provider.js'
import { CliError } from '../../lib/errors.js'

// Bridge the global `tw --user <ref>` (stripped by `src/index.ts`) into
// cli-core's attachers, which only see per-command `--user`. Explicit ref
// passed by commander wins over the captured global ref.
//
// `active()` passes the substituted ref straight through — cli-core's
// `KeyringTokenStore.active` returns `null` on a miss, which the attachers
// surface via `onNotAuthenticated` (status / token view). `clear()` does the
// extra existence check first, because cli-core's `KeyringTokenStore.clear`
// is a silent no-op on a non-matching ref and would otherwise let
// `tw --user <wrong> auth logout` print `✓ Logged out`.
export function withUserRefAware(
    store: TwistTokenStore,
    requestedRef: AccountRef | undefined,
): TwistTokenStore {
    return Object.assign(Object.create(store) as TwistTokenStore, {
        active: (ref?: AccountRef) => store.active(ref ?? requestedRef),
        clear: async (ref?: AccountRef) => {
            if (ref === undefined && requestedRef !== undefined) {
                const records = await store.list()
                if (!records.some(({ account }) => matchTwistAccount(account, requestedRef))) {
                    throw new CliError(
                        'ACCOUNT_NOT_FOUND',
                        `No stored account matches "${requestedRef}".`,
                    )
                }
            }
            await store.clear(ref ?? requestedRef)
        },
    })
}
