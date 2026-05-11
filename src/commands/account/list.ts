import chalk from 'chalk'
import { getConfig } from '../../lib/config.js'
import { isAccessible } from '../../lib/global-args.js'
import { formatJson } from '../../lib/output.js'
import { getDefaultUserId, getStoredUsers } from '../../lib/users.js'

export type ListAccountsOptions = {
    json?: boolean
}

export async function listAccountsCommand(options: ListAccountsOptions): Promise<void> {
    // One config read drives both the account list and the default lookup.
    const config = await getConfig()
    const users = getStoredUsers(config)
    const defaultId = getDefaultUserId(config)

    if (options.json) {
        console.log(
            formatJson(
                users.map((u) => ({
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    isDefault: u.id === defaultId,
                    authMode: u.auth_mode,
                    authScope: u.auth_scope,
                    storage: u.api_token ? 'config-file' : 'secure-store',
                })),
            ),
        )
        return
    }

    if (users.length === 0) {
        console.log(chalk.dim('No stored Twist accounts. Run `tw auth login` to add one.'))
        return
    }

    const accessible = isAccessible()
    for (const u of users) {
        const isDefault = u.id === defaultId
        const marker = isDefault ? (accessible ? ' [default]' : chalk.green(' (default)')) : ''
        const label = u.name ? `${u.name} <${u.email}>` : u.email
        console.log(`${label} ${chalk.dim(`(id:${u.id})`)}${marker}`)
    }
}
