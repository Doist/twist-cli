import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/skills/update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn().mockResolvedValue({ updated: [], skipped: [], errors: [] }),
}))

vi.mock('./lib/migrate-auth.js', () => ({
    migrateLegacyAuth: vi.fn().mockResolvedValue({ status: 'no-legacy-state' }),
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

    it('calls migrateLegacyAuth silently', async () => {
        const { migrateLegacyAuth } = await import('./lib/migrate-auth.js')
        await import('./postinstall.js')
        expect(migrateLegacyAuth).toHaveBeenCalledWith({ silent: true })
    })

    it('swallows skill-update errors', async () => {
        const { updateAllInstalledSkills } = await import('./lib/skills/update-installed.js')
        vi.mocked(updateAllInstalledSkills).mockRejectedValueOnce(new Error('fail'))
        await expect(import('./postinstall.js')).resolves.not.toThrow()
    })

    it('swallows migration errors', async () => {
        const { migrateLegacyAuth } = await import('./lib/migrate-auth.js')
        vi.mocked(migrateLegacyAuth).mockRejectedValueOnce(new Error('fail'))
        await expect(import('./postinstall.js')).resolves.not.toThrow()
    })
})
