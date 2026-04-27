import chalk from 'chalk'
import { getConfig, setConfig, type UserSettings } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'

const TRUE_VALUES = new Set(['true', 'on', '1', 'yes'])
const FALSE_VALUES = new Set(['false', 'off', '0', 'no'])

function parseBoolean(raw: string, key: string): boolean {
    const normalized = raw.trim().toLowerCase()
    if (TRUE_VALUES.has(normalized)) return true
    if (FALSE_VALUES.has(normalized)) return false
    throw new CliError(
        'INVALID_VALUE',
        `Invalid boolean value "${raw}" for ${key}. Use one of: true, false, on, off, 1, 0.`,
    )
}

type Setter = (config: { userSettings?: UserSettings }, value: string) => string

const SETTERS: Record<string, { description: string; apply: Setter }> = {
    'unarchive-new-threads': {
        description: 'Unarchive newly-created threads so they appear in your Inbox',
        apply: (config, value) => {
            const parsed = parseBoolean(value, 'unarchive-new-threads')
            config.userSettings = { ...config.userSettings, unarchiveNewThreads: parsed }
            return `userSettings.unarchiveNewThreads = ${parsed}`
        },
    },
}

export async function setConfigValue(key: string, value: string): Promise<void> {
    const setter = SETTERS[key]
    if (!setter) {
        const known = Object.keys(SETTERS).join(', ')
        throw new CliError('UNKNOWN_KEY', `Unknown config key "${key}". Known keys: ${known}.`)
    }

    const config = await getConfig()
    const summary = setter.apply(config, value)
    await setConfig(config)

    console.log(chalk.green('✓'), `Set ${chalk.cyan(summary)}`)
}

export function listSettableKeys(): string {
    return Object.entries(SETTERS)
        .map(([key, { description }]) => `  ${key.padEnd(28)} ${description}`)
        .join('\n')
}
