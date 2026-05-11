import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}))

vi.mock('../../package.json', () => ({
    default: {
        version: '1.0.0',
        engines: {
            node: '^20.19.0 || >=22.12.0',
        },
    },
}))

vi.mock('../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/auth.js')>()
    return {
        ...actual,
        probeApiToken: vi.fn(),
    }
})

vi.mock('../lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/config.js')>()
    return {
        ...actual,
        getConfig: vi.fn().mockResolvedValue({}),
        getConfigPath: vi.fn(() => '/tmp/test-config.json'),
    }
})

vi.mock('../lib/api.js', () => ({
    createWrappedTwistClient: vi.fn(),
}))

import { createWrappedTwistClient } from '../lib/api.js'
import { NoTokenError, probeApiToken } from '../lib/auth.js'
import { getConfig } from '../lib/config.js'
import { registerDoctorCommand } from './doctor.js'

const mockReadFile = vi.mocked(readFile)
const mockCreateWrappedTwistClient = vi.mocked(createWrappedTwistClient)
const mockProbeApiToken = vi.mocked(probeApiToken)
const mockGetConfig = vi.mocked(getConfig)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerDoctorCommand(program)
    return program
}

function mockFetch(version: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version }),
        }),
    )
}

describe('doctor command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let originalProcessVersion: PropertyDescriptor | undefined

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.clearAllMocks()
        vi.unstubAllGlobals()
        process.exitCode = undefined

        mockReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
        mockGetConfig.mockResolvedValue({})
        mockProbeApiToken.mockResolvedValue({
            token: 'test_token_123456789',
            metadata: { authMode: 'read-write', source: 'secure-store' },
        })
        mockCreateWrappedTwistClient.mockReturnValue({
            users: {
                getSessionUser: vi.fn().mockResolvedValue({
                    id: 1,
                    email: 'person@example.com',
                    name: 'Example Person',
                }),
            },
        } as never)

        originalProcessVersion = Object.getOwnPropertyDescriptor(process, 'version')
        Object.defineProperty(process, 'version', {
            configurable: true,
            value: 'v20.19.0',
        })
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        process.exitCode = undefined
        if (originalProcessVersion) {
            Object.defineProperty(process, 'version', originalProcessVersion)
        }
    })

    it('reports a healthy setup', async () => {
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Node.js v20.19.0'))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Authenticated as person@example.com via secure-store'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 2 passed')
        expect(process.exitCode).toBeUndefined()
    })

    it('warns when plaintext config fallback is in use and an update is available', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                token: 'plaintext-token',
                update_channel: 'pre-release',
            }),
        )
        mockGetConfig.mockResolvedValue({ updateChannel: 'pre-release' })
        mockProbeApiToken.mockResolvedValue({
            token: 'plaintext-token',
            metadata: { authMode: 'read-write', source: 'config-file' },
        })
        mockFetch('2.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'WARN Authenticated as person@example.com, but token is stored in plaintext config fallback',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Config file is readable (/tmp/test-config.json)'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WARN Update available on pre-release: v1.0.0 -> v2.0.0'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 1 passed, 2 warnings')
        expect(process.exitCode).toBeUndefined()
    })

    it('warns when config fields are invalid or unrecognized', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                pendingSecureStoreClear: 'yes',
                currentWorkspace: 'abc',
                authMode: 'admin',
                update_channel: 'beta',
                extraSetting: true,
            }),
        )
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        const configWarning = consoleSpy.mock.calls.find(
            (call: unknown[]) =>
                typeof call[0] === 'string' &&
                (call[0] as string).includes('WARN Config file is readable but'),
        )?.[0]

        expect(configWarning).toEqual(expect.any(String))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WARN Config file is readable but'),
        )
        expect(configWarning).toContain('contains unrecognized key "extraSetting"')
        expect(configWarning).toContain('pendingSecureStoreClear must be a boolean')
        expect(configWarning).toContain('currentWorkspace must be a positive integer')
        expect(configWarning).toContain('authMode must be one of: read-only, read-write, unknown')
        expect(configWarning).toContain('update_channel must be one of: stable, pre-release')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Authenticated as person@example.com via secure-store'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 2 passed, 1 warning')
        expect(process.exitCode).toBeUndefined()
    })

    it('reads legacy updateChannel from on-disk config and reports the channel', async () => {
        // Disk still has the legacy camelCase key; read-seam translates it,
        // so doctor reports the configured channel exactly as it would for
        // a canonical `update_channel` file. No "unrecognized key" warning.
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                token: 'plaintext-token',
                updateChannel: 'pre-release',
            }),
        )
        mockGetConfig.mockResolvedValue({ updateChannel: 'pre-release' })
        mockProbeApiToken.mockResolvedValue({
            token: 'plaintext-token',
            metadata: { authMode: 'read-write', source: 'config-file' },
        })
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on pre-release (v1.0.0)'),
        )
        const configWarning = consoleSpy.mock.calls.find(
            (call: unknown[]) =>
                typeof call[0] === 'string' &&
                (call[0] as string).includes('WARN Config file is readable but'),
        )?.[0]
        // updateChannel is a known legacy key — must not show as unrecognized.
        expect(configWarning ?? '').not.toContain('unrecognized key "updateChannel"')
    })

    it('flags invalid legacy updateChannel value in the validator', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                updateChannel: 'beta',
            }),
        )
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        const configWarning = consoleSpy.mock.calls.find(
            (call: unknown[]) =>
                typeof call[0] === 'string' &&
                (call[0] as string).includes('WARN Config file is readable but'),
        )?.[0]
        expect(configWarning).toContain('updateChannel must be one of: stable, pre-release')
    })

    it('normalizes invalid update channel values to stable', async () => {
        mockGetConfig.mockResolvedValue({ updateChannel: 'beta' as never })
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('on beta'))
    })

    it('supports json output and offline mode', async () => {
        mockProbeApiToken.mockRejectedValue(new NoTokenError())

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor', '--json', '--offline'])

        const output = consoleSpy.mock.calls.at(-1)?.[0]
        expect(typeof output).toBe('string')

        const parsed = JSON.parse(output as string) as {
            ok: boolean
            summary: { passed: number; warned: number; failed: number; skipped: number }
            checks: Array<{ name: string; status: string }>
        }

        expect(parsed.ok).toBe(true)
        expect(parsed.summary.passed).toBe(0)
        expect(parsed.summary.skipped).toBe(1)
        expect(parsed.checks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'auth', status: 'warn' }),
                expect.objectContaining({ name: 'update', status: 'skip' }),
            ]),
        )
    })

    it('marks secure-store auth as skipped in offline mode', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor', '--offline'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'SKIP Auth validation skipped (--offline); credentials found via secure-store',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 0 passed, 2 skipped')
    })

    it('does not instantiate the API client in offline mode', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor', '--offline'])

        expect(mockCreateWrappedTwistClient).not.toHaveBeenCalled()
    })

    it('fails when node or config are invalid', async () => {
        Object.defineProperty(process, 'version', {
            configurable: true,
            value: 'v18.0.0',
        })
        mockReadFile.mockResolvedValue('{')
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'tw', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('FAIL Node.js v18.0.0 does not satisfy ^20.19.0 || >=22.12.0'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('FAIL Could not read config file /tmp/test-config.json'),
        )
        expect(process.exitCode).toBe(1)
    })
})
