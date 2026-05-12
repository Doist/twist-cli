import { formatJson, formatNdjson } from '@doist/cli-core'
import { attachStatusCommand } from '@doist/cli-core/auth'
import { TwistRequestError, type User } from '@doist/twist-sdk'
import chalk from 'chalk'
import type { Command } from 'commander'
import { createWrappedTwistClient, getSessionUser } from '../../lib/api.js'
import type { TwistAccount, TwistTokenStore } from '../../lib/auth-provider.js'
import { type AuthMetadata, getAuthMetadata, NoTokenError } from '../../lib/auth.js'
import type { AuthMode } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'

type StatusData = {
    user: User
    metadata: AuthMetadata
}

function formatAuthMode(authMode: AuthMode, authScope?: string): string {
    if (authMode === 'read-only') {
        return `read-only (scope: ${authScope ?? 'unknown'})`
    }
    if (authMode === 'read-write') {
        return 'read-write'
    }
    return 'unknown (manual token or env var; assuming write access)'
}

/**
 * `token` shortcut: when the caller already has a resolved token (from the
 * cli-core `store.active()` snapshot), pass it through to skip the redundant
 * keyring round-trip `getSessionUser()` would do via `getApiToken`.
 *
 * 401-translation lives here so both the snapshot path (`fetchLive`) and the
 * legacy path (`onNotAuthenticated`) emit the same `NO_TOKEN` envelope when
 * the token is rejected by the API.
 */
async function gatherStatusData(token?: string): Promise<StatusData> {
    try {
        const user = token
            ? await createWrappedTwistClient(token).users.getSessionUser()
            : await getSessionUser()
        const metadata = await getAuthMetadata()
        return { user, metadata }
    } catch (error) {
        if (error instanceof NoTokenError) throw error
        if (error instanceof TwistRequestError && error.httpStatusCode === 401) {
            throw new CliError('NO_TOKEN', 'Not authenticated (token expired or invalid)', [
                'Run `tw auth login` to re-authenticate',
            ])
        }
        throw error
    }
}

function buildStatusText({ user, metadata }: StatusData): readonly string[] {
    const modeLabel = formatAuthMode(metadata.authMode, metadata.authScope)
    return [
        `${chalk.green('✓')} Authenticated`,
        `  Email: ${user.email}`,
        `  Name:  ${user.name}`,
        `  Mode:  ${modeLabel}`,
    ]
}

function buildStatusJson({ user, metadata }: StatusData): unknown {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        authMode: metadata.authMode,
        authScope: metadata.authScope,
        source: metadata.source,
    }
}

/**
 * Attach `tw auth status` via cli-core's generic `attachStatusCommand`.
 *
 * `TwistTokenStore.active()` returns `null` for env-token mode + when no
 * identity is persisted (per the adapter's documented contract — see
 * `auth-provider.ts`). To preserve the existing UX for those cases we route
 * the full status fetch through `onNotAuthenticated`; when `active()` does
 * return a snapshot, `fetchLive` covers the same gather so renderText /
 * renderJson read from a single closure-captured `StatusData` regardless of
 * which path we took. The snapshot path also short-circuits one credential
 * resolve via `gatherStatusData(token)`.
 */
export function attachTwistStatusCommand(auth: Command, store: TwistTokenStore): Command {
    let data: StatusData | null = null

    return attachStatusCommand<TwistAccount>(auth, {
        store,
        description: 'Show current authentication status',
        fetchLive: async ({ token }) => {
            data = await gatherStatusData(token)
            return {
                id: String(data.user.id),
                label: data.user.name,
                authMode: data.metadata.authMode,
                authScope: data.metadata.authScope ?? '',
            }
        },
        renderText: () => {
            if (!data) throw new Error('status renderText called before fetchLive')
            return buildStatusText(data)
        },
        renderJson: () => {
            if (!data) throw new Error('status renderJson called before fetchLive')
            return buildStatusJson(data)
        },
        onNotAuthenticated: async ({ view }) => {
            // active() returned null — env-token mode, manual `tw auth token`
            // (no persisted identity), or nothing stored. Drive the legacy
            // resolver (getSessionUser) so all three paths render identically;
            // getSessionUser throws NoTokenError when nothing resolves,
            // matching prior UX.
            data = await gatherStatusData()
            if (view.json) {
                console.log(formatJson(buildStatusJson(data)))
                return
            }
            if (view.ndjson) {
                console.log(formatNdjson([buildStatusJson(data)]))
                return
            }
            for (const line of buildStatusText(data)) console.log(line)
        },
    })
}
