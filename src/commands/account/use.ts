import chalk from 'chalk'
import { setDefaultUserId } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'

export async function useAccountCommand(ref: string | undefined): Promise<void> {
    if (!ref) {
        throw new CliError(
            'MISSING_REF',
            'Please provide an account id or email: `tw account use <id|email>`',
        )
    }

    const user = await setDefaultUserId(ref)
    console.log(chalk.green('✓'), `Default account set to ${user.email} (id:${user.id})`)
}
