import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('../../lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/config.js')>()
    return {
        ...actual,
        CONFIG_PATH: '/tmp/fake-twist-cli/config.json',
        readConfigStrict: vi.fn(),
    }
})

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        probeApiToken: vi.fn(),
    }
})

import { NoTokenError, probeApiToken } from '../../lib/auth.js'
import { type Config, readConfigStrict } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { SecureStoreUnavailableError } from '../../lib/secure-store.js'
import { registerConfigCommand } from './index.js'

const mockReadConfigStrict = vi.mocked(readConfigStrict)
const mockProbeApiToken = vi.mocked(probeApiToken)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerConfigCommand(program)
    return program
}

const fullConfig: Config = {
    token: 'tw_abcdefghij1234567890',
    authMode: 'read-write',
    authScope: 'user:read',
    currentWorkspace: 12345,
    updateChannel: 'stable',
}

function presentConfig(config: Config = fullConfig) {
    mockReadConfigStrict.mockResolvedValue({ state: 'present', config })
}

function missingConfig() {
    mockReadConfigStrict.mockResolvedValue({ state: 'missing' })
}

function mockToken(
    source: 'env' | 'secure-store' | 'config-file',
    overrides: Partial<{
        token: string
        authMode: 'read-only' | 'read-write' | 'unknown'
        authScope: string
    }> = {},
) {
    mockProbeApiToken.mockResolvedValue({
        token: overrides.token ?? (fullConfig.token as string),
        metadata: {
            authMode: overrides.authMode ?? 'read-write',
            authScope: overrides.authScope,
            source,
        },
    })
}

describe('config view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('prints a pretty layout with the token masked by default', async () => {
        presentConfig()
        mockToken('config-file', { authScope: 'user:read' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('/tmp/fake-twist-cli/config.json')
        expect(output).toContain('Authentication')
        expect(output).toContain('Workspace')
        expect(output).toContain('Updates')
        expect(output).toContain('****…7890')
        expect(output).not.toContain('tw_abcdefghij1234567890')
        expect(output).toContain('config file (plaintext fallback)')
        expect(output).toContain('read-write')
        expect(output).toContain('12345')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('labels tokens stored in the system credential manager', async () => {
        presentConfig({ authMode: 'read-write' })
        mockToken('secure-store', { token: 'tw_keychainXXXXXXXX1234' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…1234')
        expect(output).toContain('system credential manager')
        expect(output).not.toContain('plaintext')

        consoleSpy.mockRestore()
    })

    it('labels env-sourced tokens and shows active mode, not stale config values', async () => {
        // Config has a stale read-only entry from a previous `tw auth login`,
        // but TWIST_API_TOKEN is now driving auth with an unknown scope.
        presentConfig({
            authMode: 'read-only',
            authScope: 'user:read',
        })
        mockToken('env', { token: 'tw_envXXXXXXXX5678', authMode: 'unknown' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…5678')
        expect(output).toContain('TWIST_API_TOKEN')
        // Active mode is unknown (env scope isn't introspectable), not read-only.
        expect(output).toContain('Mode:          unknown')
        expect(output).not.toMatch(/Scope:\s+user:read/)

        consoleSpy.mockRestore()
    })

    it('degrades gracefully when the credential manager is unavailable', async () => {
        presentConfig({ authMode: 'read-write', updateChannel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new SecureStoreUnavailableError('macOS Keychain error'))
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('unknown')
        expect(output).toContain('system credential manager unavailable')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('--json emits the raw config with token masked', async () => {
        presentConfig()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.token).toBe('****…7890')
        expect(parsed.authMode).toBe('read-write')
        expect(parsed.currentWorkspace).toBe(12345)

        consoleSpy.mockRestore()
    })

    it('--show-token reveals the full token in both views', async () => {
        presentConfig()
        mockToken('config-file')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--show-token'])
        const pretty = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(pretty).toContain('tw_abcdefghij1234567890')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json', '--show-token'])
        const json = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(json.token).toBe('tw_abcdefghij1234567890')

        consoleSpy.mockRestore()
    })

    it('handles a missing config file gracefully', async () => {
        missingConfig()
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])
        expect(consoleSpy.mock.calls[0][0]).toContain('not created yet')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])
        expect(consoleSpy.mock.calls[0][0]).toBe('{}')

        consoleSpy.mockRestore()
    })

    it('surfaces malformed-config errors instead of silently pretending it is empty', async () => {
        mockReadConfigStrict.mockRejectedValue(
            new CliError(
                'CONFIG_INVALID_JSON',
                'Config file at /tmp/fake-twist-cli/config.json is not valid JSON: Unexpected token',
                ['Fix the JSON'],
            ),
        )
        mockProbeApiToken.mockRejectedValue(new NoTokenError())

        await expect(
            createProgram().parseAsync(['node', 'tw', 'config', 'view']),
        ).rejects.toMatchObject({ code: 'CONFIG_INVALID_JSON' })
    })

    it('shows "not set" when no token can be found anywhere', async () => {
        presentConfig({ updateChannel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('not set')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('masks very short tokens without exposing characters', async () => {
        presentConfig({ token: 'abcd' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.token).toBe('****')
        expect(parsed.token).not.toContain('abcd')

        consoleSpy.mockRestore()
    })
})
