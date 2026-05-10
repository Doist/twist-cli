import { describe, expect, it, vi } from 'vitest'

vi.mock('@doist/cli-core', async () => {
    const actual = await vi.importActual<typeof import('@doist/cli-core')>('@doist/cli-core')
    return {
        ...actual,
        getConfigPath: vi.fn((appName: string) => `/tmp/cli-core-test/${appName}/config.json`),
        readConfig: vi.fn(),
        readConfigStrict: vi.fn(),
        writeConfig: vi.fn(),
    }
})

import {
    getConfigPath as getConfigPathCore,
    readConfig as readConfigCore,
    readConfigStrict as readConfigStrictCore,
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

    it('accepts canonical update_channel values', () => {
        expect(validateConfigForDoctor({ update_channel: 'stable' })).toEqual([])
        expect(validateConfigForDoctor({ update_channel: 'pre-release' })).toEqual([])
    })

    it('rejects invalid update_channel values', () => {
        expect(validateConfigForDoctor({ update_channel: 'beta' })).toContain(
            'update_channel must be one of: stable, pre-release',
        )
    })

    it('emits a legacy-key warning when on-disk config still has updateChannel', () => {
        const issues = validateConfigForDoctor({ updateChannel: 'pre-release' })
        expect(issues).toContain(
            'updateChannel is a legacy key — will be migrated to update_channel automatically on next config write',
        )
        // Legacy key must not be flagged as "unrecognized" — it's a known
        // migration alias.
        expect(issues.some((i) => i.includes('unrecognized'))).toBe(false)
    })
})

describe('legacy updateChannel migration (read seam)', () => {
    it('getConfig migrates updateChannel → update_channel transparently', async () => {
        mockReadConfigCore.mockResolvedValueOnce({ updateChannel: 'pre-release' })
        const config = await getConfig()
        expect(config).toEqual({ update_channel: 'pre-release' })
        expect(config).not.toHaveProperty('updateChannel')
    })

    it('getConfig passes through update_channel unchanged when already canonical', async () => {
        mockReadConfigCore.mockResolvedValueOnce({ update_channel: 'stable' })
        await expect(getConfig()).resolves.toEqual({ update_channel: 'stable' })
    })

    it('getConfig drops the legacy key when both are present (canonical wins)', async () => {
        mockReadConfigCore.mockResolvedValueOnce({
            update_channel: 'stable',
            updateChannel: 'pre-release',
        })
        const config = await getConfig()
        expect(config).toEqual({ update_channel: 'stable' })
        expect(config).not.toHaveProperty('updateChannel')
    })

    it('readConfigStrict migrates legacy key on the present branch', async () => {
        mockReadConfigStrictCore.mockResolvedValueOnce({
            state: 'present',
            config: { updateChannel: 'pre-release' },
        })
        await expect(readConfigStrict()).resolves.toEqual({
            state: 'present',
            config: { update_channel: 'pre-release' },
        })
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

    it('updateConfig merges with the current (migrated) config and writes canonical shape', async () => {
        // On-disk file has the legacy key — updateConfig should migrate, merge,
        // and write the canonical key (legacy key dropped from output).
        mockReadConfigCore.mockResolvedValueOnce({
            currentWorkspace: 7,
            updateChannel: 'pre-release',
        })
        mockWriteConfigCore.mockResolvedValueOnce(undefined)

        await updateConfig({ authMode: 'read-write' })

        expect(mockWriteConfigCore).toHaveBeenCalledWith(
            '/tmp/cli-core-test/twist-cli/config.json',
            {
                currentWorkspace: 7,
                update_channel: 'pre-release',
                authMode: 'read-write',
            },
        )
    })
})
