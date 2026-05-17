import type { AccountRef } from '@doist/cli-core/auth'
import type { TwistTokenStore } from '../../lib/auth-provider.js'
import { CliError } from '../../lib/errors.js'

// Bridge the global `tw --user <ref>` (stripped by `src/index.ts`) into
// cli-core's attachers, which only see per-command `--user`. Explicit ref
// passed by commander wins over the captured global ref. When a global ref
// is substituted, validate existence here so the typed `ACCOUNT_NOT_FOUND`
// surfaces — cli-core's `KeyringTokenStore.clear` is a silent no-op on a
// non-matching ref, and `requireSnapshotForRef` only throws when the
// per-command ref is set (which the global form deliberately strips).
export function withUserRefAware(
    store: TwistTokenStore,
    requestedRef: AccountRef | undefined,
): TwistTokenStore {
    async function effectiveRef(explicit: AccountRef | undefined): Promise<AccountRef | undefined> {
        if (explicit !== undefined || requestedRef === undefined) {
            return explicit
        }
        const records = await store.list()
        if (
            !records.some(
                ({ account }) => account.id === requestedRef || account.label === requestedRef,
            )
        ) {
            throw new CliError('ACCOUNT_NOT_FOUND', `No stored account matches "${requestedRef}".`)
        }
        return requestedRef
    }
    return Object.assign(Object.create(store) as TwistTokenStore, {
        active: async (ref?: AccountRef) => store.active(await effectiveRef(ref)),
        clear: async (ref?: AccountRef) => store.clear(await effectiveRef(ref)),
    })
}
