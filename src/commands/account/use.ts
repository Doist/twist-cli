import chalk from 'chalk'
import { findAccountInStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'
import { assertV2Available } from './helpers.js'

export async function useAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    await assertV2Available()
    const account = await findAccountInStore(store, ref)
    await store.setDefault(account.id)

    const payload = { id: account.id, label: account.label, isDefault: true }
    if (options.json) console.log(formatJson(payload))
    else if (options.ndjson) console.log(formatNdjson([payload]))
    else console.log(`✓ Default account set to ${chalk.dim(`id:${account.id}`)}  ${account.label}`)
}
