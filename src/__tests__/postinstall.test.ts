import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/skills/update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn().mockResolvedValue({ updated: [], skipped: [], errors: [] }),
}))

describe('postinstall', () => {
    it('calls updateAllInstalledSkills with local: false', async () => {
        const { updateAllInstalledSkills } = await import('../lib/skills/update-installed.js')
        await import('../postinstall.js')
        expect(updateAllInstalledSkills).toHaveBeenCalledWith({ local: false })
    })

    it('swallows errors', async () => {
        const { updateAllInstalledSkills } = await import('../lib/skills/update-installed.js')
        vi.mocked(updateAllInstalledSkills).mockRejectedValueOnce(new Error('fail'))
        await expect(import('../postinstall.js')).resolves.not.toThrow()
    })
})
