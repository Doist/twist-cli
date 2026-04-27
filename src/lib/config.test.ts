import { describe, expect, it } from 'vitest'
import { validateConfigForDoctor } from './config.js'

describe('validateConfigForDoctor', () => {
    it('accepts an empty config', () => {
        expect(validateConfigForDoctor({})).toEqual([])
    })

    it('accepts a valid userSettings.unarchiveNewThreads', () => {
        expect(validateConfigForDoctor({ userSettings: { unarchiveNewThreads: true } })).toEqual([])
        expect(validateConfigForDoctor({ userSettings: { unarchiveNewThreads: false } })).toEqual(
            [],
        )
        expect(validateConfigForDoctor({ userSettings: {} })).toEqual([])
    })

    it('rejects non-boolean unarchiveNewThreads', () => {
        const issues = validateConfigForDoctor({
            userSettings: { unarchiveNewThreads: 'yes' },
        })
        expect(issues).toContain('userSettings.unarchiveNewThreads must be a boolean')
    })

    it('rejects unknown nested keys under userSettings', () => {
        const issues = validateConfigForDoctor({
            userSettings: { somethingElse: 1 },
        })
        expect(issues).toContain('userSettings contains unrecognized key "somethingElse"')
    })

    it('rejects userSettings that is not an object', () => {
        expect(validateConfigForDoctor({ userSettings: true })).toContain(
            'userSettings must be an object',
        )
        expect(validateConfigForDoctor({ userSettings: [] })).toContain(
            'userSettings must be an object',
        )
        expect(validateConfigForDoctor({ userSettings: null })).toContain(
            'userSettings must be an object',
        )
    })
})
