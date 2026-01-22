import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.config', 'twist-cli', 'config.json')

export interface Config {
    token?: string
    currentWorkspace?: number
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
    await mkdir(dir, { recursive: true })
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function updateConfig(updates: Partial<Config>): Promise<void> {
    const config = await getConfig()
    await setConfig({ ...config, ...updates })
}

export function getConfigPath(): string {
    return CONFIG_PATH
}
