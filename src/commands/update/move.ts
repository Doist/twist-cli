import { spawn } from 'node:child_process'
import { emitView, getErrorMessage, type UpdateChannel } from '@doist/cli-core'
import {
    fetchLatestVersion,
    getConfiguredUpdateChannel,
    getInstallTag,
} from '@doist/cli-core/commands'
import chalk from 'chalk'
import packageJson from '../../../package.json' with { type: 'json' }
import { CliError } from '../../lib/errors.js'
import { NEW_PACKAGE_NAME } from '../../lib/moved.js'
import { stopEarlySpinner, withSpinner } from '../../lib/spinner.js'

const OLD_PACKAGE_NAME = packageJson.name
const CURRENT_VERSION = packageJson.version

export type PackageManager = 'npm' | 'pnpm'

type UpdateCommandOptions = {
    check?: boolean
    channel?: boolean
    json?: boolean
    ndjson?: boolean
}

/**
 * Same npm-vs-pnpm detection `@doist/cli-core`'s update command uses (it
 * isn't exported): pnpm's global store puts `pnpm` in the running script's
 * path, and `npm_execpath` covers runs through a package manager.
 */
export function detectPackageManager(): PackageManager {
    const haystack = [process.env.npm_execpath, process.argv[1], process.execPath]
        .filter(Boolean)
        .join(' ')
    return haystack.includes('pnpm') ? 'pnpm' : 'npm'
}

function uninstallArgs(pm: PackageManager): string[] {
    return [pm === 'pnpm' ? 'remove' : 'uninstall', '-g', OLD_PACKAGE_NAME]
}

function installArgs(pm: PackageManager, spec: string): string[] {
    return [pm === 'pnpm' ? 'add' : 'install', '-g', spec]
}

function manualCommands(pm: PackageManager, tag: string): string[] {
    return [
        [pm, ...uninstallArgs(pm)].join(' '),
        [pm, ...installArgs(pm, `${NEW_PACKAGE_NAME}@${tag}`)].join(' '),
    ]
}

/** Runs the package manager with its output streamed to the user; resolves to the exit code. */
function runPackageManager(pm: PackageManager, args: string[]): Promise<number> {
    console.log(chalk.dim(`$ ${[pm, ...args].join(' ')}`))
    return new Promise((resolve) => {
        const child = spawn(pm, args, {
            stdio: 'inherit',
            // npm/pnpm are `.cmd` shims on Windows that spawn() can't resolve
            // without a shell. Every argument is a fixed string or a package
            // spec built from constants.
            shell: process.platform === 'win32',
        })
        child.on('error', (error) => {
            console.error(chalk.red(`Couldn't run ${pm}: ${error.message}`))
            resolve(1)
        })
        child.on('close', (code) => resolve(code ?? 1))
    })
}

/**
 * Resolve what to install before touching the current install, so an
 * unreachable registry leaves `tw` as it is. The new package may not publish
 * a `next` dist-tag, so pre-release users fall back to `latest` rather than
 * failing after the old package has been removed.
 */
async function resolveTarget(channel: UpdateChannel): Promise<{ tag: string; version: string }> {
    try {
        const version = await fetchLatestVersion({ packageName: NEW_PACKAGE_NAME, channel })
        return { tag: getInstallTag(channel), version }
    } catch (error) {
        if (channel !== 'pre-release') throw error
        const version = await fetchLatestVersion({
            packageName: NEW_PACKAGE_NAME,
            channel: 'stable',
        })
        return { tag: getInstallTag('stable'), version }
    }
}

/**
 * `tw update` for the final `@doist/twist-cli` release. That package gets no
 * further versions, so updating in place would report "up to date" forever.
 * Instead, replace it with `@todoist/twist-cli`: both ship the `tw` binary,
 * so the old package is removed first, and restored if the new one fails to
 * install. `--check` and JSON/NDJSON output only describe the move.
 */
export async function runMoveUpdate(configPath: string, cmd: UpdateCommandOptions): Promise<void> {
    if (cmd.check && cmd.channel) {
        throw new CliError('INVALID_FLAGS', 'Specify either --check or --channel, not both.')
    }
    const view = { json: cmd.json, ndjson: cmd.ndjson }
    const channel = await getConfiguredUpdateChannel(configPath)

    if (cmd.channel) {
        emitView(view, { channel }, () => [
            `Update channel: ${channel === 'pre-release' ? chalk.magenta('pre-release') : chalk.green('stable')}`,
        ])
        return
    }

    const pm = detectPackageManager()

    if (cmd.check || view.json || view.ndjson) {
        const commands = manualCommands(pm, getInstallTag(channel))
        emitView(
            view,
            {
                currentVersion: CURRENT_VERSION,
                channel,
                movedTo: NEW_PACKAGE_NAME,
                ...(cmd.check ? { updateAvailable: true } : { installed: false }),
                command: 'tw update',
                manualCommands: commands,
            },
            () => [
                chalk.yellow(
                    `tw has moved to ${NEW_PACKAGE_NAME} (you have ${OLD_PACKAGE_NAME} v${CURRENT_VERSION}).`,
                ),
                `Run ${chalk.cyan('tw update')} to switch, or switch manually:`,
                ...commands.map((command) => `  ${command}`),
            ],
        )
        return
    }

    let target: { tag: string; version: string }
    try {
        target = await withSpinner(
            { text: `Looking up ${NEW_PACKAGE_NAME}...`, color: 'blue' },
            () => resolveTarget(channel),
        )
    } catch (error) {
        throw new CliError(
            'UPDATE_CHECK_FAILED',
            `Couldn't look up ${NEW_PACKAGE_NAME}: ${getErrorMessage(error)}. Nothing was changed.`,
            ['Try again later, or switch manually:', ...manualCommands(pm, getInstallTag(channel))],
        )
    }

    const commands = manualCommands(pm, target.tag)
    // The package manager writes straight to the terminal, so no spinner may
    // be drawing over it.
    stopEarlySpinner()
    console.log(
        `${chalk.yellow(`tw has moved to ${NEW_PACKAGE_NAME}.`)} Switching from ${OLD_PACKAGE_NAME} v${CURRENT_VERSION} to ${NEW_PACKAGE_NAME} v${target.version}...`,
    )

    const uninstallCode = await runPackageManager(pm, uninstallArgs(pm))
    if (uninstallCode !== 0) {
        throw new CliError(
            'UPDATE_INSTALL_FAILED',
            `Couldn't remove ${OLD_PACKAGE_NAME} (${pm} exited with code ${uninstallCode}).`,
            ['Switch manually (with sudo if your global packages need it):', ...commands],
        )
    }

    const installCode = await runPackageManager(
        pm,
        installArgs(pm, `${NEW_PACKAGE_NAME}@${target.tag}`),
    )
    if (installCode !== 0) {
        console.error(
            chalk.yellow(
                `Installing ${NEW_PACKAGE_NAME} failed. Restoring ${OLD_PACKAGE_NAME} v${CURRENT_VERSION}...`,
            ),
        )
        const restoreCode = await runPackageManager(
            pm,
            installArgs(pm, `${OLD_PACKAGE_NAME}@${CURRENT_VERSION}`),
        )
        const outcome =
            restoreCode === 0
                ? `${OLD_PACKAGE_NAME} v${CURRENT_VERSION} was restored.`
                : `Restoring ${OLD_PACKAGE_NAME} also failed, so tw may no longer be installed.`
        throw new CliError(
            'UPDATE_INSTALL_FAILED',
            `Couldn't install ${NEW_PACKAGE_NAME} (${pm} exited with code ${installCode}). ${outcome}`,
            ['Switch manually:', ...commands],
        )
    }

    console.log(
        `${chalk.green('✓')} Installed ${NEW_PACKAGE_NAME} v${target.version}. tw keeps working with the same config and login.`,
    )
}
