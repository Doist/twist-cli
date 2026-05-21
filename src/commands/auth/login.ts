import { attachLoginCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import { renderError, renderSuccess } from '../../lib/auth-pages.js'
import {
    createTwistAuthProvider,
    scopesForReadOnly,
    type TwistTokenStore,
} from '../../lib/auth-provider.js'
import { logTokenStorageResult } from './helpers.js'

const PREFERRED_CALLBACK_PORT = 8766

export function attachTwistLoginCommand(parent: Command, store: TwistTokenStore): Command {
    const provider = createTwistAuthProvider()

    return attachLoginCommand(parent, {
        provider,
        store,
        preferredPort: PREFERRED_CALLBACK_PORT,
        resolveScopes: ({ readOnly }) => scopesForReadOnly(readOnly),
        renderSuccess,
        renderError,
        onSuccess({ view, account }) {
            const isMachineOutput = view.json || view.ndjson
            if (!isMachineOutput) {
                console.log(chalk.green('✓'), 'OAuth authentication successful!')
                console.log(chalk.dim(`Logged in as ${account.label}`))
            }
            const result = store.getLastStorageResult()
            if (result) {
                logTokenStorageResult(
                    result,
                    'Token stored securely in the system credential manager',
                    isMachineOutput,
                )
            }
        },
    }).description('Authenticate using OAuth (opens browser)')
}
