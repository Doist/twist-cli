import { readConfig as readConfigCore, writeConfig as writeConfigCore } from '@doist/cli-core'
import { registerUpdateCommand as registerCoreUpdateCommand } from '@doist/cli-core/commands'
import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigPath } from '../../lib/config.js'
import { withSpinner } from '../../lib/spinner.js'

/**
 * Bridge a legacy on-disk config (`updateChannel` only, no `update_channel`)
 * to cli-core's expected canonical key. cli-core reads the file directly and
 * bypasses twist's `getConfig` translation seam, so a user who set the
 * channel under an older twist build and hasn't written config since the
 * #211 upgrade would otherwise have their preference silently ignored.
 *
 * Runs at most once per `tw update*` invocation, only when the file is in
 * the legacy-only state. No-op for fresh installs, canonical-only files,
 * and files that already carry both keys (post-#211 dual-write).
 */
async function migrateLegacyChannelKey(configPath: string): Promise<void> {
    const raw = await readConfigCore<Record<string, unknown>>(configPath)
    if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        !('updateChannel' in raw) ||
        'update_channel' in raw
    ) {
        return
    }
    const value = (raw as Record<string, unknown>).updateChannel
    await writeConfigCore(configPath, { ...raw, update_channel: value })
}

export function registerUpdateCommand(program: Command): void {
    const configPath = getConfigPath()
    registerCoreUpdateCommand(program, {
        packageName: packageJson.name,
        currentVersion: packageJson.version,
        configPath,
        changelogCommandName: 'tw changelog',
        withSpinner,
    })
    // Commander propagates parent hooks to subcommands, so this fires for
    // both `tw update` and `tw update switch` before cli-core's action runs.
    program.commands
        .find((c) => c.name() === 'update')
        ?.hook('preAction', async () => {
            await migrateLegacyChannelKey(configPath)
        })
}
