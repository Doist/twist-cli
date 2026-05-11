import { attachLoginCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import { renderError, renderSuccess } from '../../lib/auth-pages.js'
import {
    createTwistAuthProvider,
    createTwistTokenStore,
    READ_ONLY_SCOPES,
    READ_WRITE_SCOPES,
} from '../../lib/auth-provider.js'
import { logTokenStorageResult } from './helpers.js'

const PREFERRED_CALLBACK_PORT = 8766

export function attachTwistLoginCommand(parent: Command): Command {
    const provider = createTwistAuthProvider()
    const store = createTwistTokenStore()

    return attachLoginCommand(parent, {
        provider,
        store,
        preferredPort: PREFERRED_CALLBACK_PORT,
        resolveScopes: ({ readOnly }) => (readOnly ? READ_ONLY_SCOPES : READ_WRITE_SCOPES),
        renderSuccess,
        renderError,
        onSuccess({ view, account }) {
            // Keep stdout clean for machine consumers — cli-core's `attachLoginCommand`
            // already wrote the JSON / NDJSON success envelope before this hook runs.
            if (view.json || view.ndjson) return
            console.log(chalk.green('✓'), 'OAuth authentication successful!')
            console.log(chalk.dim(`Logged in as ${account.label}`))
            const result = store.lastSaveResult
            if (result) {
                logTokenStorageResult(
                    result,
                    'Token stored securely in the system credential manager',
                )
            }
        },
    }).description('Authenticate using OAuth (opens browser)')
}
