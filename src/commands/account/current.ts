import chalk from 'chalk'
import type { TwistTokenStore } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatNdjson } from '../../lib/output.js'

type EnvPayload = { source: 'env' }
type LegacyPayload = { source: 'legacy' }
type AccountPayload = {
    id: string
    label: string
    authMode: string
    authScope?: string
    source: 'config'
}

function emit(
    options: ViewOptions,
    payload: EnvPayload | LegacyPayload | AccountPayload,
    human: () => string[],
): void {
    if (options.json) {
        console.log(formatJson(payload))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson([payload]))
        return
    }
    for (const line of human()) console.log(line)
}

export async function currentAccount(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    if (process.env[TOKEN_ENV_VAR]) {
        emit(options, { source: 'env' }, () => [
            `Active token sourced from environment variable ${TOKEN_ENV_VAR} (no stored account).`,
        ])
        return
    }

    const snapshot = await store.active()
    if (!snapshot) {
        throw new CliError('NO_TOKEN', 'No stored account is currently active.', [
            'Run: tw auth login',
        ])
    }
    const { account } = snapshot

    // Legacy snapshots have empty id/label — rendering them as a "real"
    // account would mislead the operator. Surface the migration state
    // instead so they know why list/use/remove can't see this session.
    if (!account.id || !account.label) {
        emit(options, { source: 'legacy' }, () => [
            'Active token is a legacy single-user session (pre-multi-account).',
            chalk.dim('Run `tw auth status` while online to migrate it into the v2 store.'),
        ])
        return
    }

    emit(
        options,
        {
            id: account.id,
            label: account.label,
            authMode: account.authMode,
            authScope: account.authScope || undefined,
            source: 'config',
        },
        () => {
            const lines = [
                `Active account: ${chalk.dim(`id:${account.id}`)}  ${account.label}`,
                `  Mode:  ${account.authMode}`,
            ]
            if (account.authScope) lines.push(`  Scope: ${account.authScope}`)
            return lines
        },
    )
}
