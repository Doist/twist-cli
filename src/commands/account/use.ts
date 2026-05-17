import { emitView } from '@doist/cli-core'
import chalk from 'chalk'
import { findAccountInStore, type TwistTokenStore } from '../../lib/auth-provider.js'
import type { ViewOptions } from '../../lib/options.js'
import { assertV2Available } from './helpers.js'

export async function useAccount(
    ref: string,
    options: ViewOptions,
    store: TwistTokenStore,
): Promise<void> {
    await assertV2Available()
    const account = await findAccountInStore(store, ref)
    await store.setDefault(account.id)

    emitView(options, { id: account.id, label: account.label, isDefault: true }, () => [
        `✓ Default account set to ${chalk.dim(`id:${account.id}`)}  ${account.label}`,
    ])
}
