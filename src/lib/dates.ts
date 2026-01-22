const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    if (diff < 0) {
        return formatAbsoluteDate(d)
    }

    if (diff < MINUTE) {
        return 'just now'
    }

    if (diff < HOUR) {
        const mins = Math.floor(diff / MINUTE)
        return `${mins} minute${mins === 1 ? '' : 's'} ago`
    }

    if (diff < DAY) {
        const hours = Math.floor(diff / HOUR)
        return `${hours} hour${hours === 1 ? '' : 's'} ago`
    }

    if (diff < 2 * DAY) {
        return 'yesterday'
    }

    if (diff < 7 * DAY) {
        const days = Math.floor(diff / DAY)
        return `${days} days ago`
    }

    return formatAbsoluteDate(d)
}

function formatAbsoluteDate(date: Date): string {
    const now = new Date()
    const sameYear = date.getFullYear() === now.getFullYear()

    if (sameYear) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function parseDate(dateStr: string): Date | null {
    const d = new Date(dateStr)
    return Number.isNaN(d.getTime()) ? null : d
}
