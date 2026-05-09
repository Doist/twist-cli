import { TwistRequestError } from '@doist/twist-sdk'
import chalk from 'chalk'
import { getDefaultAccountId, getStoredAccounts } from '../../lib/accounts.js'
import { getSessionUser } from '../../lib/api.js'
import { getAuthMetadata, NoTokenError } from '../../lib/auth.js'
import { getConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { formatJson } from '../../lib/output.js'

export async function showStatus(options: { json?: boolean }): Promise<void> {
    let user
    try {
        user = await getSessionUser()
    } catch (error) {
        if (error instanceof NoTokenError) throw error
        if (error instanceof TwistRequestError && error.httpStatusCode === 401) {
            throw new CliError('NO_TOKEN', 'Not authenticated (token expired or invalid)', [
                'Run `tw auth login` to re-authenticate',
            ])
        }
        throw error
    }

    // One config read covers both the stored-accounts list and the
    // default-id lookup; metadata fetch runs in parallel so cold status
    // doesn't pay for sequential FS hops.
    const [metadata, config] = await Promise.all([getAuthMetadata(), getConfig()])
    const storedAccounts = getStoredAccounts(config)
    const defaultAccountId = getDefaultAccountId(config)
    const userIdStr = String(user.id)

    if (options.json) {
        console.log(
            formatJson({
                id: user.id,
                email: user.email,
                name: user.name,
                authMode: metadata.authMode,
                authScope: metadata.authScope,
                source: metadata.source,
                isDefault: defaultAccountId === userIdStr,
                storedAccounts: storedAccounts.map((a) => ({
                    id: a.id,
                    email: a.email,
                    isDefault: defaultAccountId === a.id,
                })),
            }),
        )
        return
    }

    const modeLabel =
        metadata.authMode === 'read-only'
            ? `read-only (scope: ${metadata.authScope ?? 'unknown'})`
            : metadata.authMode === 'read-write'
              ? 'read-write'
              : 'unknown (manual token or env var; assuming write access)'

    // env source wins over default: when running with TWIST_API_TOKEN, hiding
    // the env override behind a (default) marker would obscure important
    // debugging context.
    const marker =
        metadata.source === 'env'
            ? ' (TWIST_API_TOKEN)'
            : defaultAccountId === userIdStr
              ? ' (default)'
              : ''

    console.log(chalk.green('✓'), `Authenticated${marker}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Name:  ${user.name}`)
    console.log(`  Mode:  ${modeLabel}`)

    const others = storedAccounts.filter((a) => a.id !== userIdStr)
    if (others.length > 0) {
        console.log()
        console.log(chalk.dim(`Other stored accounts (${others.length}):`))
        for (const other of others) {
            const otherMarker = other.id === defaultAccountId ? chalk.dim(' (default)') : ''
            console.log(`  ${other.email} ${chalk.dim(`(id:${other.id})`)}${otherMarker}`)
        }
        console.log(
            chalk.dim(
                'Use `tw account use <id|email>` to switch default, or `--user <ref>` per command.',
            ),
        )
    }
}
