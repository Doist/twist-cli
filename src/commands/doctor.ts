import { readFile } from 'node:fs/promises'
import { TwistApi } from '@doist/twist-sdk'
import chalk from 'chalk'
import type { Command } from 'commander'
import pkg from '../../package.json' with { type: 'json' }
import { NoTokenError, TOKEN_ENV_VAR, probeApiToken } from '../lib/auth.js'
import { getConfigPath, validateConfigForDoctor } from '../lib/config.js'
import { formatJson } from '../lib/output.js'
import {
    compareVersions,
    fetchLatestVersion,
    getConfiguredUpdateChannel,
    isNewer,
    parseVersion,
} from '../lib/update.js'

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface DoctorOptions {
    json?: boolean
    offline?: boolean
}

interface DoctorCheck {
    name: string
    status: CheckStatus
    message: string
    details?: Record<string, unknown>
}

interface Summary {
    passed: number
    warned: number
    failed: number
    skipped: number
}

function summarize(checks: DoctorCheck[]): Summary {
    return checks.reduce<Summary>(
        (summary, check) => {
            if (check.status === 'pass') summary.passed += 1
            if (check.status === 'warn') summary.warned += 1
            if (check.status === 'fail') summary.failed += 1
            if (check.status === 'skip') summary.skipped += 1
            return summary
        },
        { passed: 0, warned: 0, failed: 0, skipped: 0 },
    )
}

function buildSummaryLine(summary: Summary): string {
    const parts = [`${summary.passed} passed`]
    if (summary.warned > 0)
        parts.push(`${summary.warned} warning${summary.warned === 1 ? '' : 's'}`)
    if (summary.failed > 0) parts.push(`${summary.failed} failed`)
    if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`)
    return parts.join(', ')
}

function formatStatus(status: CheckStatus): string {
    switch (status) {
        case 'pass':
            return chalk.green('PASS')
        case 'warn':
            return chalk.yellow('WARN')
        case 'fail':
            return chalk.red('FAIL')
        case 'skip':
            return chalk.gray('SKIP')
        default:
            return status
    }
}

function nextCaretUpperBound(version: string): string {
    const parsed = parseVersion(version)

    if (parsed.major > 0) {
        return `${parsed.major + 1}.0.0`
    }

    if (parsed.minor > 0) {
        return `0.${parsed.minor + 1}.0`
    }

    return `0.0.${parsed.patch + 1}`
}

function satisfiesComparator(currentVersion: string, comparator: string): boolean | null {
    const trimmed = comparator.trim()
    if (!trimmed) return true

    if (trimmed.startsWith('>=')) {
        return compareVersions(currentVersion, trimmed.slice(2).trim()) >= 0
    }

    if (trimmed.startsWith('^')) {
        const baseVersion = trimmed.slice(1).trim()
        return (
            compareVersions(currentVersion, baseVersion) >= 0 &&
            compareVersions(currentVersion, nextCaretUpperBound(baseVersion)) < 0
        )
    }

    if (/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(trimmed)) {
        return compareVersions(currentVersion, trimmed) === 0
    }

    return null
}

function satisfiesVersionRange(currentVersion: string, range: string): boolean | null {
    const clauses = range
        .split('||')
        .map((clause) => clause.trim())
        .filter(Boolean)

    let sawUnsupportedSyntax = false

    for (const clause of clauses) {
        let clauseMatches = true

        for (const comparator of clause.split(/\s+/).filter(Boolean)) {
            const result = satisfiesComparator(currentVersion, comparator)
            if (result === null) {
                sawUnsupportedSyntax = true
                clauseMatches = false
                break
            }
            if (!result) {
                clauseMatches = false
                break
            }
        }

        if (clauseMatches) {
            return true
        }
    }

    return sawUnsupportedSyntax ? null : false
}

function isNoTokenError(error: unknown): boolean {
    return (
        error instanceof NoTokenError ||
        (error instanceof Error && error.message.includes('No API token found'))
    )
}

function describeAuthSource(
    source: Awaited<ReturnType<typeof probeApiToken>>['metadata']['source'],
): string {
    switch (source) {
        case 'env':
            return 'environment variable'
        case 'config-file':
            return 'plaintext config fallback'
        case 'secure-store':
            return 'secure-store'
        default:
            return source
    }
}

function checkNodeVersion(): DoctorCheck | null {
    const requiredVersion = pkg.engines?.node
    if (typeof requiredVersion !== 'string' || !requiredVersion.trim()) {
        return {
            name: 'node',
            status: 'warn',
            message:
                'Could not verify Node.js version because package.json has no engines.node range',
            details: { currentVersion: process.version },
        }
    }

    const currentVersion = process.version
    const isSupported = satisfiesVersionRange(currentVersion, requiredVersion)

    if (isSupported === true) {
        return null
    }

    if (isSupported === null) {
        return {
            name: 'node',
            status: 'warn',
            message: `Could not verify Node.js version against unsupported engine range "${requiredVersion}"`,
            details: { currentVersion, requiredVersion },
        }
    }

    return {
        name: 'node',
        status: 'fail',
        message: `Node.js ${currentVersion} does not satisfy ${requiredVersion}`,
        details: { currentVersion, requiredVersion },
    }
}

async function checkConfigFile(): Promise<DoctorCheck | null> {
    const configPath = getConfigPath()

    try {
        const content = await readFile(configPath, 'utf-8')
        const parsed = JSON.parse(content) as unknown

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {
                name: 'config',
                status: 'fail',
                message: `Config file must contain a JSON object (${configPath})`,
                details: { path: configPath },
            }
        }

        const issues = validateConfigForDoctor(parsed as Record<string, unknown>)
        return {
            name: 'config',
            status: issues.length > 0 ? 'warn' : 'pass',
            message:
                issues.length > 0
                    ? `Config file is readable but ${issues.join('; ')} (${configPath})`
                    : `Config file is readable (${configPath})`,
            details: { path: configPath, exists: true, issues },
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null
        }

        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'config',
            status: 'fail',
            message: `Could not read config file ${configPath}: ${message}`,
            details: { path: configPath },
        }
    }
}

async function checkAuthentication(offline: boolean): Promise<DoctorCheck> {
    let token: string
    let metadata: Awaited<ReturnType<typeof probeApiToken>>['metadata']

    try {
        const probe = await probeApiToken()
        token = probe.token
        metadata = probe.metadata
    } catch (error) {
        if (isNoTokenError(error)) {
            return {
                name: 'auth',
                status: 'warn',
                message: `No Twist credentials found. Set ${TOKEN_ENV_VAR} or run \`tw auth login\``,
            }
        }

        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'auth',
            status: 'fail',
            message: `Could not load saved credentials: ${message}`,
        }
    }

    const details: Record<string, unknown> = {
        source: metadata.source,
        authMode: metadata.authMode,
    }
    if (metadata.authScope) details.authScope = metadata.authScope

    if (offline) {
        return {
            name: 'auth',
            status: metadata.source === 'config-file' ? 'warn' : 'skip',
            message:
                metadata.source === 'config-file'
                    ? 'Token found in plaintext config fallback; skipped API validation (--offline)'
                    : `Auth validation skipped (--offline); credentials found via ${describeAuthSource(metadata.source)}`,
            details,
        }
    }

    try {
        const api = new TwistApi(token)
        const user = await api.users.getSessionUser()
        details.email = user.email
        details.name = user.name

        return {
            name: 'auth',
            status: metadata.source === 'config-file' ? 'warn' : 'pass',
            message:
                metadata.source === 'config-file'
                    ? `Authenticated as ${user.email}, but token is stored in plaintext config fallback`
                    : `Authenticated as ${user.email} via ${describeAuthSource(metadata.source)}`,
            details,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'auth',
            status: 'fail',
            message: `Stored credentials failed validation: ${message}`,
            details,
        }
    }
}

async function checkForUpdates(offline: boolean): Promise<DoctorCheck> {
    const currentVersion = pkg.version
    const channel = await getConfiguredUpdateChannel()

    if (offline) {
        return {
            name: 'update',
            status: 'skip',
            message: `Skipped npm registry check (--offline); current version is v${currentVersion}`,
            details: { currentVersion, channel },
        }
    }

    try {
        const latestVersion = await fetchLatestVersion(channel)

        if (isNewer(currentVersion, latestVersion)) {
            return {
                name: 'update',
                status: 'warn',
                message: `Update available on ${channel}: v${currentVersion} -> v${latestVersion}`,
                details: { currentVersion, latestVersion, channel },
            }
        }

        if (currentVersion === latestVersion) {
            return {
                name: 'update',
                status: 'pass',
                message: `CLI is up to date on ${channel} (v${currentVersion})`,
                details: { currentVersion, latestVersion, channel },
            }
        }

        return {
            name: 'update',
            status: 'pass',
            message: `CLI version v${currentVersion} is ahead of ${channel} tag v${latestVersion}`,
            details: { currentVersion, latestVersion, channel },
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'update',
            status: 'warn',
            message: `Could not check npm registry for updates: ${message}`,
            details: { currentVersion, channel },
        }
    }
}

async function runDoctorChecks(options: DoctorOptions): Promise<DoctorCheck[]> {
    return [
        checkNodeVersion(),
        await checkConfigFile(),
        await checkAuthentication(Boolean(options.offline)),
        await checkForUpdates(Boolean(options.offline)),
    ].filter((check): check is DoctorCheck => check !== null)
}

export async function doctorAction(options: DoctorOptions): Promise<void> {
    const checks = await runDoctorChecks(options)
    const summary = summarize(checks)
    const ok = summary.failed === 0

    if (options.json) {
        console.log(formatJson({ ok, summary, checks }))
    } else {
        for (const check of checks) {
            console.log(`${formatStatus(check.status)} ${check.message}`)
        }

        const label = ok ? chalk.green('Doctor summary:') : chalk.red('Doctor summary:')
        console.log(`${label} ${buildSummaryLine(summary)}`)
    }

    if (!ok) {
        process.exitCode = 1
    }
}

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Diagnose common CLI setup and environment issues')
        .option('--json', 'Output diagnostic results as JSON')
        .option('--offline', 'Skip network checks against Twist and npm')
        .action(doctorAction)
}
