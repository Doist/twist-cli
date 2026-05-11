import { Command } from 'commander'
import { attachTwistLoginCommand } from './login.js'
import { logout } from './logout.js'
import { showStatus } from './status.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    attachTwistLoginCommand(auth)

    auth.command('token [token]')
        .description('Save API token for CLI authentication')
        .action(loginWithToken)

    auth.command('status')
        .description('Show current authentication status')
        .option('--json', 'Output as JSON')
        .action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
