import { createInstaller } from './create-installer.js'
import type { AgentInfo, SkillInstaller } from './types.js'

export const skillInstallers: Record<string, SkillInstaller> = {
    'claude-code': createInstaller({
        name: 'claude-code',
        description: 'Claude Code skill for Twist CLI',
        dirName: '.claude',
    }),
    codex: createInstaller({
        name: 'codex',
        description: 'Codex skill for Twist CLI',
        dirName: '.codex',
    }),
    cursor: createInstaller({
        name: 'cursor',
        description: 'Cursor skill for Twist CLI',
        dirName: '.cursor',
    }),
}

export function getInstaller(name: string): SkillInstaller | null {
    return skillInstallers[name] ?? null
}

export function listAgentNames(): string[] {
    return Object.keys(skillInstallers)
}

export async function listAgents(local: boolean): Promise<AgentInfo[]> {
    const agents: AgentInfo[] = []

    for (const name of listAgentNames()) {
        const installer = skillInstallers[name]
        const installed = await installer.isInstalled({ local })
        agents.push({
            name,
            description: installer.description,
            installed,
            path: installed ? installer.getInstallPath({ local }) : null,
        })
    }

    return agents
}

export type { AgentInfo, InstallOptions, SkillInstaller, UninstallOptions } from './types.js'
