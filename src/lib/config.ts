import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.config', 'twist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

export interface Config {
    // Legacy plaintext token storage retained for migration and secure-store fallback only.
    token?: string
    // Non-secret state used to finish logout after transient secure-store failures.
    pendingSecureStoreClear?: boolean
    currentWorkspace?: number
    // Auth metadata persisted alongside the token to track OAuth scope.
    authMode?: AuthMode
    authScope?: string
    updateChannel?: UpdateChannel
}

export async function getConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        return JSON.parse(content) as Config
    } catch {
        return {}
    }
}

export async function setConfig(config: Config): Promise<void> {
    const dir = dirname(CONFIG_PATH)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
    })
    await chmod(CONFIG_PATH, 0o600)
}

export async function updateConfig(updates: Partial<Config>): Promise<void> {
    const config = await getConfig()
    await setConfig({ ...config, ...updates })
}

export function getConfigPath(): string {
    return CONFIG_PATH
}
