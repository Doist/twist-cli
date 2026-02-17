export interface InstallOptions {
    local?: boolean
    force?: boolean
}

export interface UninstallOptions {
    local?: boolean
}

export interface UpdateOptions {
    local?: boolean
}

export interface SkillInstaller {
    name: string
    description: string
    install(options: InstallOptions): Promise<void>
    update(options: UpdateOptions): Promise<void>
    uninstall(options: UninstallOptions): Promise<void>
    isInstalled(options: { local?: boolean }): Promise<boolean>
    getInstallPath(options: { local?: boolean }): string
}

export interface AgentInfo {
    name: string
    description: string
    installed: boolean
    path: string | null
}
