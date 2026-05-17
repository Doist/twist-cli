import { emitView } from '@doist/cli-core'
import chalk from 'chalk'
import { findAccountInStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { logTokenStorageResult } from '../auth/helpers.js'
import { assertV2Available } from './helpers.js'

export async function removeAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    await assertV2Available()
    const account = await findAccountInStore(store, ref)
    await store.clear(account.id)

    emitView(options, { id: account.id, label: account.label, removed: true }, () => [
        `✓ Removed account ${chalk.dim(`id:${account.id}`)}  ${account.label}`,
    ])

    const clearResult = store.getLastClearResult()
    if (clearResult) {
        logTokenStorageResult(
            clearResult,
            'Stored token removed from the system credential manager',
            options.json || options.ndjson,
        )
    }
}
