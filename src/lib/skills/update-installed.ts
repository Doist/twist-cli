import { skillInstallers } from './index.js'

export interface UpdateAllResult {
    updated: string[]
    skipped: string[]
    errors: string[]
}

export async function updateAllInstalledSkills(options: {
    local?: boolean
}): Promise<UpdateAllResult> {
    const result: UpdateAllResult = { updated: [], skipped: [], errors: [] }

    for (const [name, installer] of Object.entries(skillInstallers)) {
        try {
            const installed = await installer.isInstalled(options)
            if (!installed) {
                result.skipped.push(name)
                continue
            }
            await installer.update(options)
            result.updated.push(name)
        } catch (err) {
            result.errors.push(`${name}: ${(err as Error).message}`)
        }
    }

    return result
}
