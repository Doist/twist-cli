import chalk from 'chalk'
import { requireAccountByRef } from '../../lib/accounts.js'
import { setDefaultAccountId } from '../../lib/auth.js'
import { getConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'

export async function useAccountCommand(ref: string | undefined): Promise<void> {
    if (!ref) {
        throw new CliError(
            'MISSING_REF',
            'Please provide an account id or email: `tw account use <id|email>`',
        )
    }

    const config = await getConfig()
    const { account } = requireAccountByRef(config, ref)
    await setDefaultAccountId(account.id)

    console.log(chalk.green('✓'), `Default account set to ${account.email} (id:${account.id})`)
}
