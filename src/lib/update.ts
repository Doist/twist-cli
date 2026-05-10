import { getConfig, type UpdateChannel } from './config.js'

export const PACKAGE_NAME = '@doist/twist-cli'
const VALID_UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

interface RegistryResponse {
    version: string
}

interface ParsedVersion {
    major: number
    minor: number
    patch: number
    prerelease: string | undefined
}

export function getInstallTag(channel: UpdateChannel): string {
    return channel === 'pre-release' ? 'next' : 'latest'
}

export function normalizeUpdateChannel(channel: unknown): UpdateChannel {
    return typeof channel === 'string' && VALID_UPDATE_CHANNELS.has(channel as UpdateChannel)
        ? (channel as UpdateChannel)
        : 'stable'
}

export function parseVersion(version: string): ParsedVersion {
    const [core, ...rest] = version.replace(/^v/, '').split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, prerelease: rest.length > 0 ? rest.join('-') : undefined }
}

export function compareVersions(a: string, b: string): number {
    const left = parseVersion(a)
    const right = parseVersion(b)

    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
    }

    if (!left.prerelease && right.prerelease) return 1
    if (left.prerelease && !right.prerelease) return -1

    if (left.prerelease && right.prerelease) {
        return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true })
    }

    return 0
}

export function isNewer(current: string, candidate: string): boolean {
    return compareVersions(candidate, current) > 0
}

export async function fetchLatestVersion(channel: UpdateChannel): Promise<string> {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/${getInstallTag(channel)}`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Registry returned ${response.status}`)
    }
    const data = (await response.json()) as RegistryResponse
    return data.version
}

export async function getConfiguredUpdateChannel(): Promise<UpdateChannel> {
    const config = await getConfig()
    return normalizeUpdateChannel(config.update_channel)
}
