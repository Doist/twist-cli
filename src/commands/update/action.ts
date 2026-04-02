import { spawn } from 'node:child_process'
import chalk from 'chalk'
import pkg from '../../../package.json' with { type: 'json' }
import { getConfig } from '../../lib/config.js'
import { withSpinner } from '../../lib/spinner.js'

const PACKAGE_NAME = '@doist/twist-cli'

interface ParsedVersion {
    major: number
    minor: number
    patch: number
    prerelease: string | undefined
}

function parseVersion(version: string): ParsedVersion {
    const [core, ...rest] = version.split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, prerelease: rest.length > 0 ? rest.join('-') : undefined }
}

function isNewer(current: string, candidate: string): boolean {
    const a = parseVersion(current)
    const b = parseVersion(candidate)
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (b[key] !== a[key]) return b[key] > a[key]
    }
    if (!a.prerelease && b.prerelease) return false
    if (a.prerelease && !b.prerelease) return true
    if (a.prerelease && b.prerelease)
        return b.prerelease.localeCompare(a.prerelease, undefined, { numeric: true }) > 0
    return false
}

export async function fetchLatestVersion(tag: string): Promise<string> {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/${tag}`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Registry returned ${response.status}`)
    }
    const data = (await response.json()) as { version: string }
    return data.version
}

export function detectPackageManager(): string {
    const execPath = process.env.npm_execpath ?? ''
    if (execPath.includes('pnpm')) {
        return 'pnpm'
    }
    return 'npm'
}

export function runInstall(pm: string, tag: string): Promise<{ exitCode: number; stderr: string }> {
    const command = pm === 'pnpm' ? 'add' : 'install'
    return new Promise((resolve, reject) => {
        const child = spawn(pm, [command, '-g', `${PACKAGE_NAME}@${tag}`], {
            stdio: 'pipe',
        })

        let stderr = ''
        child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString()
        })

        child.on('error', reject)
        child.on('close', (code) => resolve({ exitCode: code ?? 1, stderr }))
    })
}

interface UpdateOptions {
    check?: boolean
}

export async function updateAction(options: UpdateOptions): Promise<void> {
    const currentVersion = pkg.version
    const config = await getConfig()
    const channel = config.updateChannel ?? 'stable'
    const tag = channel === 'pre-release' ? 'next' : 'latest'
    const label = channel === 'pre-release' ? ` ${chalk.magenta('(pre-release)')}` : ''

    let latestVersion: string
    try {
        latestVersion = await withSpinner({ text: `Checking for updates${label}...` }, () =>
            fetchLatestVersion(tag),
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(chalk.red('Failed to check for updates:'), message)
        process.exitCode = 1
        return
    }

    const updateAvailable = isNewer(currentVersion, latestVersion)

    if (options.check) {
        const channelLine =
            channel === 'pre-release'
                ? `  Channel: ${chalk.magenta('pre-release')}`
                : `  Channel: ${chalk.green('stable')}`

        if (currentVersion === latestVersion) {
            console.log(chalk.green('✓'), `Already up to date (v${currentVersion})`)
        } else if (updateAvailable) {
            console.log(
                `Update available: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}${label}`,
            )
        } else {
            console.log(
                `Downgrade available: ${chalk.dim(`v${currentVersion}`)} → ${chalk.yellow(`v${latestVersion}`)}${label}`,
            )
        }
        console.log(channelLine)
        return
    }

    if (currentVersion === latestVersion) {
        console.log(chalk.green('✓'), `Already up to date (v${currentVersion})`)
        return
    }

    if (updateAvailable) {
        console.log(
            `Update available${label}: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}`,
        )
    } else {
        console.log(
            `Downgrade available${label}: ${chalk.dim(`v${currentVersion}`)} → ${chalk.yellow(`v${latestVersion}`)}`,
        )
    }

    const pm = detectPackageManager()

    let result: { exitCode: number; stderr: string }
    try {
        result = await withSpinner(
            { text: `Updating to v${latestVersion}${label}...`, color: 'blue' },
            () => runInstall(pm, tag),
        )
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
            console.error(
                chalk.red('Permission denied.'),
                `Try running with sudo: sudo ${pm} ${pm === 'pnpm' ? 'add' : 'install'} -g ${PACKAGE_NAME}@${tag}`,
            )
        } else {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(chalk.red('Update failed:'), message)
        }
        process.exitCode = 1
        return
    }

    if (result.exitCode !== 0) {
        console.error(chalk.red('Update failed:'), `${pm} exited with code ${result.exitCode}`)
        if (result.stderr) {
            console.error(chalk.dim(result.stderr.trim()))
        }
        process.exitCode = 1
        return
    }

    console.log(chalk.green('✓'), `Updated to v${latestVersion}`)
    if (channel !== 'pre-release') {
        console.log(
            chalk.dim('  Run'),
            chalk.cyan('tw changelog'),
            chalk.dim('to see what changed'),
        )
    }
}
