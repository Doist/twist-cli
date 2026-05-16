import type { AccountRef } from '@doist/cli-core/auth'
import type { TwistTokenStore } from '../../lib/auth-provider.js'

// Bridge the global `tw --user <ref>` (stripped by `src/index.ts`) into
// cli-core's attachers, which only see per-command `--user`. Explicit ref
// passed by commander wins over the captured global ref.
export function withUserRefAware(
    store: TwistTokenStore,
    requestedRef: AccountRef | undefined,
): TwistTokenStore {
    return Object.assign(Object.create(store) as TwistTokenStore, {
        active: (ref?: AccountRef) => store.active(ref ?? requestedRef),
        clear: (ref?: AccountRef) => store.clear(ref ?? requestedRef),
    })
}
