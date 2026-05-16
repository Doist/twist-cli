import { attachTokenViewCommand } from '@doist/cli-core/auth'
import { Command } from 'commander'
import { createTwistTokenStore } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { attachTwistLoginCommand } from './login.js'
import { attachTwistLogoutCommand } from './logout.js'
import { attachTwistStatusCommand } from './status.js'
import { withUserRefAware } from './store-wrap.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // Two views of the same storage:
    //   - `store` is the raw `TwistTokenStore` — login uses it to `set()`
    //     (login doesn't accept `--user`).
    //   - `refAware` substitutes the pre-subcommand `tw --user <ref>` (which
    //     `src/index.ts` strips from argv before commander runs) when the
    //     attachers call `active(ref?)` / `clear(ref?)` without an explicit
    //     ref of their own. Per-command `--user` declared by cli-core's
    //     attachers still wins because it arrives as the explicit `ref`
    //     argument and the wrapper short-circuits to that.
    const store = createTwistTokenStore()
    const refAware = withUserRefAware(store)

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
