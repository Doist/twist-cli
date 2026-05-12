import { attachLogoutCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import type { TwistAccount, TwistTokenStore } from '../../lib/auth-provider.js'
import { logTokenStorageResult } from './helpers.js'

/**
 * Attach `tw auth logout` via cli-core's generic `attachLogoutCommand`. The
 * registrar emits the success line (`✓ Logged out` / `{ok:true}` / silent
 * ndjson); `onCleared` only surfaces the keyring-fallback warning carried by
 * `TokenStorageResult` — cli-core's `TokenStore.clear: void` contract can't
 * expose it directly, so we stash it on the adapter (`getLastClearResult`).
 */
export function attachTwistLogoutCommand(auth: Command, store: TwistTokenStore): Command {
    return attachLogoutCommand<TwistAccount>(auth, {
        store,
        onCleared: ({ view }) => {
            const result = store.getLastClearResult()
            if (!result) return
            logTokenStorageResult(
                result,
                'Stored token removed from the system credential manager',
                view.json || view.ndjson,
            )
        },
    })
}
