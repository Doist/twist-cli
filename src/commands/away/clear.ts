import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions, ViewOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
export async function clearAway(options: MutationOptions & ViewOptions): Promise<void> {
    if (options.dryRun) {
        console.log('Dry run: would clear away status')
        return
    }

    const client = await getTwistClient()
    const user = await client.users.update({ awayMode: '' as never })

    if (options.json) {
        console.log(formatJson(user, 'user', options.full))
        return
    }

    console.log('Away status cleared.')
}
