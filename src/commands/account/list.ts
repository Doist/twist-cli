import chalk from 'chalk'
import { getDefaultAccountId, getStoredAccounts } from '../../lib/accounts.js'
import { getConfig } from '../../lib/config.js'
import { isAccessible } from '../../lib/global-args.js'
import { formatJson } from '../../lib/output.js'

export interface ListAccountsOptions {
    json?: boolean
}

export async function listAccountsCommand(options: ListAccountsOptions): Promise<void> {
    // One config read drives both the account list and the default lookup.
    const config = await getConfig()
    const accounts = getStoredAccounts(config)
    const defaultId = getDefaultAccountId(config)

    if (options.json) {
        console.log(
            formatJson(
                accounts.map((a) => ({
                    id: a.id,
                    email: a.email,
                    name: a.name,
                    isDefault: a.id === defaultId,
                    authMode: a.authMode,
                    authScope: a.authScope,
                    storage: a.token ? 'config-file' : 'secure-store',
                })),
            ),
        )
        return
    }

    if (accounts.length === 0) {
        console.log(chalk.dim('No stored Twist accounts. Run `tw auth login` to add one.'))
        return
    }

    const accessible = isAccessible()
    for (const a of accounts) {
        const isDefault = a.id === defaultId
        const marker = isDefault ? (accessible ? ' [default]' : chalk.green(' (default)')) : ''
        const label = a.name ? `${a.name} <${a.email}>` : a.email
        console.log(`${label} ${chalk.dim(`(id:${a.id})`)}${marker}`)
    }
}
