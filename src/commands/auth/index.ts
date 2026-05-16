import { attachTokenViewCommand } from '@doist/cli-core/auth'
import { Command } from 'commander'
import { createTwistTokenStore } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { attachTwistLoginCommand } from './login.js'
import { attachTwistLogoutCommand } from './logout.js'
import { attachTwistStatusCommand } from './status.js'
import { withUserRefAware } from './store-wrap.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    const store = createTwistTokenStore()
    const refAware = withUserRefAware(store, getRequestedUserRef())

    attachTwistLoginCommand(auth, store)
    attachTwistLogoutCommand(auth, refAware)
    attachTwistStatusCommand(auth, refAware)

    // `token` is a hybrid: the positional `[token]` saves, and the `view`
    // subcommand prints. Commander matches subcommand names before the parent
    // action, so `tw auth token view` always dispatches to the view path —
    // Twist OAuth tokens are opaque random strings so the literal "view" can
    // never collide with a real token value.
    const tokenCmd = auth
        .command('token [token]')
        .description('Save API token for CLI authentication (or use a subcommand: `view`)')
        .action(loginWithToken)

    attachTokenViewCommand(tokenCmd, {
        name: 'view',
        store: refAware,
        envVarName: TOKEN_ENV_VAR,
        description:
            'Print the stored API token for the active user (or --user <ref>) to stdout for use in scripts',
    })
}
