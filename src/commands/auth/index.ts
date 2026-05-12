import { Command } from 'commander'
import { createTwistTokenStore } from '../../lib/auth-provider.js'
import { attachTwistLoginCommand } from './login.js'
import { attachTwistLogoutCommand } from './logout.js'
import { attachTwistStatusCommand } from './status.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // Shared store instance: login stashes the post-`set` storage result for
    // its success handler, logout reads the post-`clear` result for the same
    // keyring-fallback warning surface. Status uses `active()` as the
    // authenticated-snapshot gate.
    const store = createTwistTokenStore()

    attachTwistLoginCommand(auth, store)
    attachTwistLogoutCommand(auth, store)
    attachTwistStatusCommand(auth, store)

    auth.command('token [token]')
        .description('Save API token for CLI authentication')
        .action(loginWithToken)
}
