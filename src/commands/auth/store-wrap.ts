import type { AccountRef, TokenStore } from '@doist/cli-core/auth'
import type { TwistAccount, TwistTokenStore } from '../../lib/auth-provider.js'
import { getRequestedUserRef } from '../../lib/global-args.js'

/**
 * Wrap a `TwistTokenStore` so that `active(ref)` and `clear(ref)` fall back
 * to the global `tw --user <ref>` flag when the caller didn't pass an
 * explicit ref. `src/index.ts` strips the pre-subcommand `--user` from
 * `process.argv` before commander runs, so cli-core's auth attachers never
 * see the global form on their own option list — this wrapper bridges that
 * gap. Per-command `--user` (e.g. `tw auth logout --user 42`) is parsed by
 * commander and passed through as the explicit `ref` argument, so it
 * naturally wins over the global form.
 *
 * Only `active` and `clear` consume refs in the wired attachers
 * (`attachLogoutCommand`, `attachStatusCommand`, `attachTokenViewCommand`).
 * `set`, `list`, `setDefault`, and the twist-specific
 * `getLastStorageResult` / `getLastClearResult` accessors pass through
 * untouched.
 */
export function withUserRefAware(store: TwistTokenStore): TwistTokenStore {
    function effectiveRef(explicit: AccountRef | undefined): AccountRef | undefined {
        return explicit ?? getRequestedUserRef()
    }
    const wrapped: TokenStore<TwistAccount> = {
        active: (ref) => store.active(effectiveRef(ref)),
        set: (account, token) => store.set(account, token),
        clear: (ref) => store.clear(effectiveRef(ref)),
        list: () => store.list(),
        setDefault: (ref) => store.setDefault(ref),
    }
    return Object.assign(wrapped, {
        getLastStorageResult: () => store.getLastStorageResult(),
        getLastClearResult: () => store.getLastClearResult(),
    })
}
