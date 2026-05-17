import { findAccountInStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'
import { assertV2Available, formatAccountLabel } from './helpers.js'

export async function useAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    await assertV2Available()
    const account = await findAccountInStore(store, ref)
    // Pass the canonical id rather than the raw ref so resolution stays
    // single-sourced — `findAccountInStore` is the only matching site.
    await store.setDefault(account.id)

    const payload = { id: account.id, label: account.label, isDefault: true }
    if (options.json) {
        console.log(formatJson(payload))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson([payload]))
        return
    }
    console.log(`✓ Default account set to ${formatAccountLabel(account)}`)
}
