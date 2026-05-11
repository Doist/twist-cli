import { fetchLatestVersion as fetchLatestVersionCore } from '@doist/cli-core/commands'
import packageJson from '../../package.json' with { type: 'json' }
import { getConfig, type UpdateChannel } from './config.js'

export { compareVersions, getInstallTag, isNewer, parseVersion } from '@doist/cli-core/commands'

const VALID_UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export async function fetchLatestVersion(channel: UpdateChannel): Promise<string> {
    return fetchLatestVersionCore({ packageName: packageJson.name, channel })
}

/**
 * Tolerant channel read for `tw doctor`. Returns the persisted value when
 * valid, otherwise `'stable'`. cli-core's strict `getConfiguredUpdateChannel`
 * throws `INVALID_UPDATE_CHANNEL` — right behaviour for the user-facing
 * `tw update` command (handled by cli-core internally), wrong behaviour for
 * diagnostics which should surface the problem as a doctor warning rather
 * than crash.
 */
export async function getConfiguredUpdateChannel(): Promise<UpdateChannel> {
    const config = await getConfig()
    const channel = config.updateChannel
    return typeof channel === 'string' && VALID_UPDATE_CHANNELS.has(channel as UpdateChannel)
        ? (channel as UpdateChannel)
        : 'stable'
}
