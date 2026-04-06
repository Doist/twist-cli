import { spawn } from 'node:child_process'
import chalk from 'chalk'
import pkg from '../../../package.json' with { type: 'json' }
import { CliError } from '../../lib/errors.js'
import { withSpinner } from '../../lib/spinner.js'
import {
    fetchLatestVersion,
    getConfiguredUpdateChannel,
    getInstallTag,
    isNewer,
    PACKAGE_NAME,
} from '../../lib/update.js'

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
    channel?: boolean
}

export async function updateAction(options: UpdateOptions): Promise<void> {
    if (options.check && options.channel) {
        throw new CliError('CONFLICTING_OPTIONS', 'Specify either --check or --channel, not both.')
    }

    if (options.channel) {
        const ch = await getConfiguredUpdateChannel()
        if (ch === 'pre-release') {
            console.log(`Update channel: ${chalk.magenta('pre-release')}`)
        } else {
            console.log(`Update channel: ${chalk.green('stable')}`)
        }
        return
    }

    const currentVersion = pkg.version
    const channel = await getConfiguredUpdateChannel()
    const tag = getInstallTag(channel)
    const label = channel === 'pre-release' ? ` ${chalk.magenta('(pre-release)')}` : ''

    let latestVersion: string
    try {
        latestVersion = await withSpinner({ text: `Checking for updates${label}...` }, () =>
            fetchLatestVersion(channel),
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new CliError('API_ERROR', `Failed to check for updates: ${message}`)
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
            throw new CliError('INTERNAL_ERROR', 'Permission denied.', [
                `Try running with sudo: sudo ${pm} ${pm === 'pnpm' ? 'add' : 'install'} -g ${PACKAGE_NAME}@${tag}`,
            ])
        }
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new CliError('INTERNAL_ERROR', `Update failed: ${message}`)
    }

    if (result.exitCode !== 0) {
        const detail = result.stderr ? `\n${result.stderr.trim()}` : ''
        throw new CliError(
            'INTERNAL_ERROR',
            `Update failed: ${pm} exited with code ${result.exitCode}${detail}`,
        )
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
