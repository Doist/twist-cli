import chalk from 'chalk'
import type { TwistTokenStore } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'

export async function currentAccount(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    if (process.env[TOKEN_ENV_VAR]) {
        const payload = { source: 'env' }
        if (options.json) console.log(formatJson(payload))
        else if (options.ndjson) console.log(formatNdjson([payload]))
        else
            console.log(
                `Active token sourced from environment variable ${TOKEN_ENV_VAR} (no stored account).`,
            )
        return
    }

    const snapshot = await store.active()
    if (!snapshot) {
        throw new CliError('NO_TOKEN', 'No stored account is currently active.', [
            'Run: tw auth login',
        ])
    }
    const { account } = snapshot

    if (!account.id || !account.label) {
        const payload = { source: 'legacy' }
        if (options.json) console.log(formatJson(payload))
        else if (options.ndjson) console.log(formatNdjson([payload]))
        else {
            console.log('Active token is a legacy single-user session (pre-multi-account).')
            console.log(
                chalk.dim('Run `tw auth status` while online to migrate it into the v2 store.'),
            )
        }
        return
    }

    const payload = {
        id: account.id,
        label: account.label,
        authMode: account.authMode,
        authScope: account.authScope || undefined,
        source: 'config',
    }
    if (options.json) console.log(formatJson(payload))
    else if (options.ndjson) console.log(formatNdjson([payload]))
    else {
        console.log(`Active account: ${chalk.dim(`id:${account.id}`)}  ${account.label}`)
        console.log(`  Mode:  ${account.authMode}`)
        if (account.authScope) console.log(`  Scope: ${account.authScope}`)
    }
}
