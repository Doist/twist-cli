import { AWAY_MODE_TYPES, type AwayModeType, TwistRequestError } from '@doist/twist-sdk'
import chalk from 'chalk'
import { Command } from 'commander'
import { getSessionUser, getTwistClient } from '../lib/api.js'
import type { MutationOptions, ViewOptions } from '../lib/options.js'
import { colors, formatJson } from '../lib/output.js'

type SetAwayOptions = ViewOptions & MutationOptions & { from?: string }

function formatLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
    return formatLocalDate(new Date())
}

function tomorrowStr(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatLocalDate(d)
}

function formatAwayType(type: string): string {
    const labels: Record<string, string> = {
        vacation: 'Vacation',
        parental: 'Parental leave',
        sickleave: 'Sick leave',
        other: 'Away',
    }
    return labels[type] ?? type
}

async function showAwayStatus(options: ViewOptions): Promise<void> {
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

async function setAway(
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

async function clearAway(options: MutationOptions & ViewOptions): Promise<void> {
    if (options.dryRun) {
        console.log('Dry run: would clear away status')
        return
    }

    const client = await getTwistClient()
    try {
        const user = await client.users.update({ awayMode: '' as never })

        if (options.json) {
            console.log(formatJson(user, 'user', options.full))
            return
        }

        console.log('Away status cleared.')
    } catch (error) {
        handleAwayError(error)
    }
}

function isInsufficientScope(error: unknown): boolean {
    if (!(error instanceof TwistRequestError)) return false
    const data = error.responseData as { error_string?: string } | undefined
    return (
        error.httpStatusCode === 403 && data?.error_string?.includes('Insufficient scope') === true
    )
}

function handleAwayError(error: unknown): never {
    if (isInsufficientScope(error)) {
        console.error(
            chalk.red('Permission denied.'),
            'The away status feature requires additional permissions.',
        )
        console.error(
            `Run ${chalk.cyan('tw auth login')} to re-authenticate with the required scopes.`,
        )
        process.exit(1)
    }
    throw error
}

export function registerAwayCommand(program: Command): void {
    const away = program
        .command('away')
        .description('Manage away status')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((options: ViewOptions) => showAwayStatus(options))

    away.command('set <type> [until]')
        .usage('<type> [until] [options]')
        .description('Set away status (type: vacation, parental, sickleave, other)')
        .option('--from <date>', 'Start date (YYYY-MM-DD, defaults to today)')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((type: string, until: string | undefined, options: SetAwayOptions) =>
            setAway(type, until, options),
        )

    away.command('clear')
        .description('Clear away status')
        .option('--dry-run', 'Show what would happen without executing')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((options: MutationOptions & ViewOptions) => clearAway(options))
}
