import { emitView } from '@doist/cli-core'
import chalk from 'chalk'
import { isLegacyAuthActive, type TwistTokenStore } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import type { ViewOptions } from '../../lib/options.js'

export async function currentAccount(options: ViewOptions, store: TwistTokenStore): Promise<void> {
    if (process.env[TOKEN_ENV_VAR]) {
        emitView(options, { source: 'env' }, () => [
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

    // Snapshot can still be the v1 legacy fallback when migration is
    // inconclusive — even when id/label are populated from the old flat
    // `authUserId` / `authUserName` fields. Treat that as legacy too.
    if (!account.id || !account.label || (await isLegacyAuthActive())) {
        emitView(options, { source: 'legacy' }, () => [
            'Active token is a legacy single-user session (pre-multi-account).',
            chalk.dim('Run `tw auth status` while online to migrate it into the v2 store.'),
        ])
        return
    }

    emitView(
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
