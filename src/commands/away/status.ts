import chalk from 'chalk'
import { getSessionUser } from '../../lib/api.js'
import type { ViewOptions } from '../../lib/options.js'
import { colors, formatJson } from '../../lib/output.js'
import { formatAwayType } from './helpers.js'

export async function showAwayStatus(options: ViewOptions): Promise<void> {
    const user = await getSessionUser()

    if (options.json) {
        console.log(formatJson(user, 'user', options.full))
        return
    }

    if (!user.awayMode) {
        console.log('Not away.')
        return
    }

    const { type, dateFrom, dateTo } = user.awayMode
    console.log(chalk.bold(formatAwayType(type)))
    console.log(`From:  ${colors.timestamp(dateFrom)}`)
    console.log(`Until: ${colors.timestamp(dateTo)}`)
}
