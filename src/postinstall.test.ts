import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/skills/update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn().mockResolvedValue({ updated: [], skipped: [], errors: [] }),
}))

vi.mock('./lib/migrate-auth.js', () => ({
    runMigrateLegacyAuth: vi.fn().mockResolvedValue({ status: 'no-legacy-state' }),
}))

describe('postinstall', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('calls updateAllInstalledSkills with local: false', async () => {
        const { updateAllInstalledSkills } = await import('./lib/skills/update-installed.js')
        await import('./postinstall.js')
        expect(updateAllInstalledSkills).toHaveBeenCalledWith({ local: false })
    })

    it('swallows errors from updateAllInstalledSkills', async () => {
        const { updateAllInstalledSkills } = await import('./lib/skills/update-installed.js')
        vi.mocked(updateAllInstalledSkills).mockRejectedValueOnce(new Error('fail'))
        await expect(import('./postinstall.js')).resolves.not.toThrow()
    })

    it('invokes runMigrateLegacyAuth({ silent: true }) on import', async () => {
        const { runMigrateLegacyAuth } = await import('./lib/migrate-auth.js')
        await import('./postinstall.js')
        expect(runMigrateLegacyAuth).toHaveBeenCalledWith({ silent: true })
    })

    it('swallows errors from runMigrateLegacyAuth so a broken migration never blocks npm install', async () => {
        const { runMigrateLegacyAuth } = await import('./lib/migrate-auth.js')
        vi.mocked(runMigrateLegacyAuth).mockRejectedValueOnce(new Error('migration boom'))
        await expect(import('./postinstall.js')).resolves.not.toThrow()
    })
})
