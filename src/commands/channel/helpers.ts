import { CliError } from '../../lib/errors.js'

export function encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ offset })).toString('base64url')
}

export function decodeCursor(cursor: string | undefined): number {
    if (!cursor) return 0

    let parsed: unknown
    try {
        parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    } catch {
        throw new CliError('INVALID_CURSOR', `Invalid cursor: ${cursor}`)
    }

    if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { offset?: unknown }).offset !== 'number' ||
        !Number.isFinite((parsed as { offset: number }).offset) ||
        (parsed as { offset: number }).offset < 0
    ) {
        throw new CliError('INVALID_CURSOR', `Invalid cursor: ${cursor}`)
    }

    return (parsed as { offset: number }).offset
}
