import chalk from 'chalk'
import {
    type AuthProbeMetadata,
    NoTokenError,
    probeApiToken,
    TOKEN_ENV_VAR,
} from '../../lib/auth.js'
import { type Config, CONFIG_PATH, readConfigStrict } from '../../lib/config.js'
import { SECURE_STORE_DESCRIPTION, SecureStoreUnavailableError } from '../../lib/secure-store.js'

export interface ViewConfigOptions {
    json?: boolean
    showToken?: boolean
}

type TokenStatus =
    | { state: 'present'; token: string; metadata: AuthProbeMetadata }
    | { state: 'missing' }
    | { state: 'unavailable'; reason: string }

function maskToken(token: string): string {
    if (token.length < 5) return '****'
    return `****…${token.slice(-4)}`
}

function describeTokenSource(source: AuthProbeMetadata['source']): string {
    switch (source) {
        case 'env':
            return `environment variable ${TOKEN_ENV_VAR}`
        case 'secure-store':
            return SECURE_STORE_DESCRIPTION
        case 'config-file':
            return 'config file (plaintext fallback)'
    }
}

async function probeTokenPresence(): Promise<TokenStatus> {
    try {
        const { token, metadata } = await probeApiToken()
        return { state: 'present', token, metadata }
    } catch (error) {
        if (error instanceof NoTokenError) return { state: 'missing' }
        if (error instanceof SecureStoreUnavailableError) {
            return {
                state: 'unavailable',
                reason: `${SECURE_STORE_DESCRIPTION} unavailable (${error.message})`,
            }
        }
        throw error
    }
}

function formatValue(value: unknown): string {
    if (value === undefined || value === null) return chalk.dim('not set')
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
}

function renderTokenLine(token: TokenStatus, showToken: boolean): string {
    switch (token.state) {
        case 'present': {
            const value = showToken ? token.token : maskToken(token.token)
            return `${value} ${chalk.dim(`(${describeTokenSource(token.metadata.source)})`)}`
        }
        case 'unavailable':
            return chalk.dim(`unknown — ${token.reason}`)
        case 'missing':
            return formatValue(undefined)
    }
}

function formatConfigView(config: Config, token: TokenStatus, showToken: boolean): string {
    const lines: string[] = []
    lines.push(`${chalk.dim('Config file:')} ${CONFIG_PATH}`)
    lines.push('')

    // When a token is present, its metadata is the ground truth for the active
    // mode/scope — this matters most for env-sourced tokens, whose scope the CLI
    // does not know and where config.auth* may be stale from an unrelated
    // `tw auth login`. For missing/unavailable tokens, fall back to the config
    // file values (what the CLI would attempt once auth recovers).
    const effectiveMode = token.state === 'present' ? token.metadata.authMode : config.authMode
    const effectiveScope = token.state === 'present' ? token.metadata.authScope : config.authScope

    lines.push(chalk.bold('Authentication'))
    lines.push(`  Token:         ${renderTokenLine(token, showToken)}`)
    lines.push(`  Mode:          ${formatValue(effectiveMode)}`)
    lines.push(`  Scope:         ${formatValue(effectiveScope)}`)
    lines.push('')

    lines.push(chalk.bold('Workspace'))
    lines.push(`  Current:       ${formatValue(config.currentWorkspace)}`)
    lines.push('')

    lines.push(chalk.bold('Updates'))
    lines.push(`  Channel:       ${formatValue(config.updateChannel)}`)

    return lines.join('\n')
}

export async function viewConfig(options: ViewConfigOptions): Promise<void> {
    const read = await readConfigStrict()
    const config: Config = read.state === 'present' ? read.config : {}

    if (options.json) {
        const output: Config = { ...config }
        if (output.token && !options.showToken) {
            output.token = maskToken(output.token)
        }
        console.log(JSON.stringify(output, null, 2))
        return
    }

    const token = await probeTokenPresence()

    if (read.state === 'missing' && token.state === 'missing') {
        console.log(`${chalk.dim('Config file:')} ${CONFIG_PATH} ${chalk.dim('(not created yet)')}`)
        return
    }

    console.log(formatConfigView(config, token, options.showToken ?? false))
}
