import { TwistRequestError } from '@doist/twist-sdk'
import { CliError } from '../../lib/errors.js'

export function formatLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr(): string {
    return formatLocalDate(new Date())
}

export function tomorrowStr(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatLocalDate(d)
}

export function formatAwayType(type: string): string {
    const labels: Record<string, string> = {
        vacation: 'Vacation',
        parental: 'Parental leave',
        sickleave: 'Sick leave',
        other: 'Away',
    }
    return labels[type] ?? type
}

export function isInsufficientScope(error: unknown): boolean {
    if (!(error instanceof TwistRequestError)) return false
    const data = error.responseData as { error_string?: string } | undefined
    return (
        error.httpStatusCode === 403 && data?.error_string?.includes('Insufficient scope') === true
    )
}

export function handleAwayError(error: unknown): never {
    if (isInsufficientScope(error)) {
        throw new CliError(
            'INSUFFICIENT_SCOPE',
            'The away status feature requires additional permissions.',
            ['Run `tw auth login` to re-authenticate with the required scopes'],
        )
    }
    throw error
}
