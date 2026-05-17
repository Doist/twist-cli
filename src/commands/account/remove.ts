import { findAccountInStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'
import { logTokenStorageResult } from '../auth/helpers.js'
import { assertV2Available, formatAccountLabel } from './helpers.js'

export async function removeAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    await assertV2Available()
    const account = await findAccountInStore(store, ref)
    // Pass the canonical id so the store mutates exactly the account we
    // validated — duplicate labels or ambiguous future matchers can't
    // re-resolve to a different record.
    await store.clear(account.id)

    const payload = { id: account.id, label: account.label, removed: true }
    const isMachineOutput = options.json || options.ndjson
    if (options.json) {
        console.log(formatJson(payload))
    } else if (options.ndjson) {
        console.log(formatNdjson([payload]))
    } else {
        console.log(`✓ Removed account ${formatAccountLabel(account)}`)
    }

    const clearResult = store.getLastClearResult()
    if (clearResult) {
        logTokenStorageResult(
            clearResult,
            'Stored token removed from the system credential manager',
            isMachineOutput,
        )
    }
}
