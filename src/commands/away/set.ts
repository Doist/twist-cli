import { AWAY_MODE_TYPES, type AwayModeType } from '@doist/twist-sdk'
import { getTwistClient } from '../../lib/api.js'
import type { MutationOptions, ViewOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { formatAwayType, handleAwayError, todayStr, tomorrowStr } from './helpers.js'

type SetAwayOptions = ViewOptions & MutationOptions & { from?: string }

export async function setAway(
    type: string,
    until: string | undefined,
    options: SetAwayOptions,
): Promise<void> {
    if (!AWAY_MODE_TYPES.includes(type as AwayModeType)) {
        console.error(`Invalid away type: ${type}. Use: ${AWAY_MODE_TYPES.join(', ')}`)
        process.exit(1)
    }

    const dateFrom = options.from ?? todayStr()
    const dateTo = until ?? tomorrowStr()

    if (options.dryRun) {
        console.log(
            `Dry run: would set away to ${formatAwayType(type)} from ${dateFrom} until ${dateTo}`,
        )
        return
    }

    const client = await getTwistClient()
    try {
        const user = await client.users.update({
            awayMode: { type: type as AwayModeType, dateFrom, dateTo },
        })

        if (options.json) {
            console.log(formatJson(user, 'user', options.full))
            return
        }

        console.log(`Set away: ${formatAwayType(type)} from ${dateFrom} until ${dateTo}`)
    } catch (error) {
        handleAwayError(error)
    }
}
