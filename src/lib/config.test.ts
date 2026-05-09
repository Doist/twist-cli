import { describe, expect, it, vi } from 'vitest'

vi.mock('@doist/cli-core', async () => {
    const actual = await vi.importActual<typeof import('@doist/cli-core')>('@doist/cli-core')
    return {
        ...actual,
        getConfigPath: vi.fn((appName: string) => `/tmp/cli-core-test/${appName}/config.json`),
        readConfig: vi.fn(),
        readConfigStrict: vi.fn(),
        writeConfig: vi.fn(),
        updateConfig: vi.fn(),
    }
})

import {
    getConfigPath as getConfigPathCore,
    readConfig as readConfigCore,
    readConfigStrict as readConfigStrictCore,
    updateConfig as updateConfigCore,
    writeConfig as writeConfigCore,
} from '@doist/cli-core'
import {
    getConfig,
    getConfigPath,
    readConfigStrict,
    setConfig,
    updateConfig,
    validateConfigForDoctor,
} from './config.js'

const mockGetConfigPathCore = vi.mocked(getConfigPathCore)
const mockReadConfigCore = vi.mocked(readConfigCore)
const mockReadConfigStrictCore = vi.mocked(readConfigStrictCore)
const mockWriteConfigCore = vi.mocked(writeConfigCore)
const mockUpdateConfigCore = vi.mocked(updateConfigCore)

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

describe('readConfigStrict wrapper', () => {
    it('passes the missing state through unchanged', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({ state: 'missing' })
        await expect(readConfigStrict()).resolves.toEqual({ state: 'missing' })
    })

    it('passes the present state through with a Config-shaped cast', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'present',
            config: { currentWorkspace: 42, authMode: 'read-write' },
        })
        await expect(readConfigStrict()).resolves.toEqual({
            state: 'present',
            config: { currentWorkspace: 42, authMode: 'read-write' },
        })
    })

    it('translates read-failed to CONFIG_READ_FAILED with twist hint copy', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'read-failed',
            error: new Error('EACCES: permission denied'),
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_READ_FAILED',
            message: expect.stringContaining('EACCES: permission denied'),
            hints: ['Check file permissions, or run `tw doctor` to diagnose'],
        })
    })

    it('translates invalid-json to CONFIG_INVALID_JSON with re-auth hint', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'invalid-json',
            error: new SyntaxError('Unexpected token } in JSON at position 12'),
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_INVALID_JSON',
            message: expect.stringContaining('Unexpected token'),
            hints: [
                'Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`',
            ],
        })
    })

    it('translates invalid-shape to CONFIG_INVALID_SHAPE and surfaces the actual type', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'invalid-shape',
            actual: 'array',
        })
        await expect(readConfigStrict()).rejects.toMatchObject({
            code: 'CONFIG_INVALID_SHAPE',
            message: expect.stringContaining('got array'),
            hints: [
                'Fix the JSON by hand, or delete the file and re-authenticate with `tw auth login`',
            ],
        })
    })
})

// Smoke tests proving the thin wrappers forward to cli-core with the
// 'twist-cli' app name. A wrong app name would silently redirect every
// config read/write — these tests are the tripwire.

describe('thin config wrappers', () => {
    it('getConfigPath resolves under the twist-cli app name', () => {
        expect(getConfigPath()).toBe('/tmp/cli-core-test/twist-cli/config.json')
        expect(mockGetConfigPathCore).toHaveBeenCalledWith('twist-cli')
    })

    it('getConfig forwards the resolved path to cli-core readConfig', async () => {
        mockReadConfigCore.mockResolvedValueOnce({ currentWorkspace: 99 })
        await expect(getConfig()).resolves.toEqual({ currentWorkspace: 99 })
        expect(mockReadConfigCore).toHaveBeenCalledWith('/tmp/cli-core-test/twist-cli/config.json')
    })

    it('setConfig forwards the resolved path and config to cli-core writeConfig', async () => {
        mockWriteConfigCore.mockResolvedValueOnce(undefined)
        await setConfig({ currentWorkspace: 7, authMode: 'read-write' })
        expect(mockWriteConfigCore).toHaveBeenCalledWith(
            '/tmp/cli-core-test/twist-cli/config.json',
            { currentWorkspace: 7, authMode: 'read-write' },
        )
    })

    it('updateConfig forwards path and updates to cli-core updateConfig', async () => {
        mockUpdateConfigCore.mockResolvedValueOnce(undefined)
        await updateConfig({ currentWorkspace: 12 })
        expect(mockUpdateConfigCore).toHaveBeenCalledWith(
            '/tmp/cli-core-test/twist-cli/config.json',
            { currentWorkspace: 12 },
        )
    })
})
