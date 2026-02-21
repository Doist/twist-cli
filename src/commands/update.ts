import { spawn } from 'node:child_process'
import chalk from 'chalk'
import type { Command } from 'commander'
import pkg from '../../package.json' with { type: 'json' }
import { withSpinner } from '../lib/spinner.js'

const PACKAGE_NAME = '@doist/twist-cli'
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`

export async function fetchLatestVersion(): Promise<string> {
    const response = await fetch(REGISTRY_URL)
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

export function runInstall(pm: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(pm, ['install', '-g', `${PACKAGE_NAME}@latest`], {
            stdio: 'inherit',
        })
        child.on('error', reject)
        child.on('close', (code) => resolve(code ?? 1))
    })
}

interface UpdateOptions {
    check?: boolean
}

export async function updateAction(options: UpdateOptions): Promise<void> {
    const currentVersion = pkg.version

    let latestVersion: string
    try {
        latestVersion = await withSpinner({ text: 'Checking for updates...' }, fetchLatestVersion)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(chalk.red('Failed to check for updates:'), message)
        process.exitCode = 1
        return
    }

    if (currentVersion === latestVersion) {
        console.log(chalk.green('✓'), `Already up to date (v${currentVersion})`)
        return
    }

    if (options.check) {
        console.log(chalk.yellow('Update available:'), `v${currentVersion} → v${latestVersion}`)
        console.log(chalk.dim('Run `tw update` to install'))
        return
    }

    console.log(chalk.blue(`Updating ${PACKAGE_NAME} v${currentVersion} → v${latestVersion}...`))

    const pm = detectPackageManager()

    try {
        const exitCode = await runInstall(pm)
        if (exitCode !== 0) {
            console.error(chalk.red('Update failed:'), `${pm} exited with code ${exitCode}`)
            process.exitCode = 1
            return
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
            console.error(
                chalk.red('Permission denied.'),
                `Try running with sudo: sudo ${pm} install -g ${PACKAGE_NAME}@latest`,
            )
        } else {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(chalk.red('Update failed:'), message)
        }
        process.exitCode = 1
        return
    }

    console.log(chalk.green('✓'), `Updated to v${latestVersion}`)
}

export function registerUpdateCommand(program: Command): void {
    program
        .command('update')
        .description('Update the CLI to the latest version')
        .option('--check', 'Check for updates without installing')
        .action(updateAction)
}
