import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SKILL_FILE_CONTENT, SKILL_NAME } from './content.js'
import type { InstallOptions, SkillInstaller, UninstallOptions } from './types.js'

interface InstallerConfig {
    name: string
    description: string
    dirName: string
}

export function createInstaller(config: InstallerConfig): SkillInstaller {
    function getInstallPath(options: { local?: boolean }): string {
        const base = options.local ? process.cwd() : homedir()
        return join(base, config.dirName, 'skills', SKILL_NAME, 'SKILL.md')
    }

    return {
        name: config.name,
        description: config.description,

        getInstallPath,

        async isInstalled(options: { local?: boolean }): Promise<boolean> {
            try {
                await stat(getInstallPath(options))
                return true
            } catch {
                return false
            }
        },

        async install(options: InstallOptions): Promise<void> {
            if (!options.local) {
                const agentDir = join(homedir(), config.dirName)
                try {
                    await stat(agentDir)
                } catch {
                    throw new Error(
                        `${config.name} does not appear to be installed (${agentDir} not found)`,
                    )
                }
            }

            const skillPath = getInstallPath(options)
            const exists = await this.isInstalled(options)

            if (exists && !options.force) {
                throw new Error(
                    `Skill already installed at ${skillPath}. Use --force to overwrite.`,
                )
            }

            await mkdir(dirname(skillPath), { recursive: true })
            await writeFile(skillPath, SKILL_FILE_CONTENT)
        },

        async uninstall(options: UninstallOptions): Promise<void> {
            const skillPath = getInstallPath(options)
            const exists = await this.isInstalled(options)

            if (!exists) {
                throw new Error(`Skill not installed at ${skillPath}`)
            }

            const skillDir = dirname(skillPath)
            await rm(skillDir, { recursive: true })
        },
    }
}
