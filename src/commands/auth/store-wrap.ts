import type { AccountRef, TokenStore } from '@doist/cli-core/auth'
import type { TwistAccount, TwistTokenStore } from '../../lib/auth-provider.js'
import { getRequestedUserRef } from '../../lib/global-args.js'

// Bridge the global `tw --user <ref>` stripped by `src/index.ts` into
// cli-core's attachers, which only see per-command `--user`. Explicit ref
// (per-command) wins over the global form.
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
