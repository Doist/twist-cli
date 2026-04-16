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
