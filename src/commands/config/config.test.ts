import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureConsole } from '../../test-helpers/console.js'
import { createTestProgram } from '../../test-helpers/program.js'

vi.mock('chalk')

vi.mock('../../lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/config.js')>()
    return {
        ...actual,
        getConfigPath: () => '/tmp/fake-twist-cli/config.json',
        readConfigStrict: vi.fn(),
        setConfig: vi.fn(),
    }
})

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        probeApiToken: vi.fn(),
    }
})

import { SecureStoreUnavailableError } from '@doist/cli-core/auth'
import { STORED_ALAN, STORED_ELLIE } from '../../lib/__fixtures__/accounts.js'
import { NoTokenError, probeApiToken } from '../../lib/auth.js'
import { type Config, readConfigStrict, setConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { registerConfigCommand } from './index.js'

const mockReadConfigStrict = vi.mocked(readConfigStrict)
const mockProbeApiToken = vi.mocked(probeApiToken)
const mockSetConfig = vi.mocked(setConfig)

const createProgram = () => createTestProgram(registerConfigCommand)

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
        const consoleSpy = captureConsole()

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
    })

    it('labels tokens stored in the system credential manager', async () => {
        presentConfig({ authMode: 'read-write' })
        mockToken('secure-store', { token: 'tw_keychainXXXXXXXX1234' })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…1234')
        expect(output).toContain('system credential manager')
        expect(output).not.toContain('plaintext')
    })

    it('labels env-sourced tokens and shows active mode, not stale config values', async () => {
        // Config has a stale read-only entry from a previous `tw auth login`,
        // but TWIST_API_TOKEN is now driving auth with an unknown scope.
        presentConfig({
            authMode: 'read-only',
            authScope: 'user:read',
        })
        mockToken('env', { token: 'tw_envXXXXXXXX5678', authMode: 'unknown' })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…5678')
        expect(output).toContain('TWIST_API_TOKEN')
        // Active mode is unknown (env scope isn't introspectable), not read-only.
        expect(output).toContain('Mode:          unknown')
        // Scope is genuinely unintrospectable for env tokens — render as
        // 'unknown', not 'not set', to avoid reading as an explicit empty scope.
        expect(output).toContain('Scope:         unknown')
        expect(output).not.toMatch(/Scope:\s+user:read/)
        expect(output).not.toMatch(/Scope:\s+not set/)
    })

    it('annotates a missing config file even when a token is present', async () => {
        // User runs with TWIST_API_TOKEN set but no config file yet —
        // the header must clearly report that the file does not exist.
        missingConfig()
        mockToken('env', { token: 'tw_envXXXXXXXX9999', authMode: 'unknown' })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('/tmp/fake-twist-cli/config.json')
        expect(output).toContain('not created yet')
        expect(output).toContain('****…9999')
        expect(output).toContain('TWIST_API_TOKEN')
    })

    it('runs view by default when no subcommand is given', async () => {
        presentConfig()
        mockToken('config-file')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Authentication')
        expect(output).toContain('****…7890')
    })

    it('degrades gracefully when the credential manager is unavailable', async () => {
        presentConfig({ authMode: 'read-write', updateChannel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new SecureStoreUnavailableError('macOS Keychain error'))
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('unknown')
        expect(output).toContain('system credential manager unavailable')
        expect(output).toContain('stable')
    })

    it('--json emits the raw config with token masked', async () => {
        presentConfig()
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.token).toBe('****…7890')
        expect(parsed.authMode).toBe('read-write')
        expect(parsed.currentWorkspace).toBe(12345)
    })

    it('--show-token reveals the full token in both views', async () => {
        presentConfig()
        mockToken('config-file')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--show-token'])
        const pretty = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(pretty).toContain('tw_abcdefghij1234567890')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json', '--show-token'])
        const json = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(json.token).toBe('tw_abcdefghij1234567890')
    })

    it('handles a missing config file gracefully', async () => {
        missingConfig()
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])
        expect(consoleSpy.mock.calls[0][0]).toContain('not created yet')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])
        expect(consoleSpy.mock.calls[0][0]).toBe('{}')
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
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('not set')
        expect(output).toContain('stable')
    })

    it('masks very short tokens without exposing characters', async () => {
        presentConfig({ token: 'abcd' })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.token).toBe('****')
        expect(parsed.token).not.toContain('abcd')
    })

    it('renders an "Authenticated accounts" block from config.users with default marker', async () => {
        presentConfig({ users: [STORED_ALAN, STORED_ELLIE], defaultUserId: '2' })
        mockToken('secure-store')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Authenticated accounts (2)')
        expect(output).toContain('id:1')
        expect(output).toContain('Alan Grant')
        expect(output).toContain('id:2')
        expect(output).toContain('Ellie Sattler')
        const bobLine = output.split('\n').find((l) => l.includes('Ellie Sattler')) ?? ''
        const adaLine = output.split('\n').find((l) => l.includes('Alan Grant')) ?? ''
        expect(bobLine).toContain('*')
        expect(adaLine).not.toContain('*')
    })

    it('marks the first stored account as default when defaultUserId is missing', async () => {
        // Mirrors getDefaultUserRecord's first-user fallback — otherwise
        // the view would claim no account is active when one will be used.
        presentConfig({ users: [STORED_ALAN, STORED_ELLIE] })
        mockToken('secure-store')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        const adaLine = output.split('\n').find((l) => l.includes('Alan Grant')) ?? ''
        const bobLine = output.split('\n').find((l) => l.includes('Ellie Sattler')) ?? ''
        expect(adaLine).toContain('*')
        expect(bobLine).not.toContain('*')
    })

    it('falls back to the first stored account when defaultUserId is stale', async () => {
        // defaultUserId points at an id that no longer exists in users[] —
        // getDefaultUserRecord still returns the first user, so the marker
        // must follow.
        presentConfig({ users: [STORED_ALAN, STORED_ELLIE], defaultUserId: '999' })
        mockToken('secure-store')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        const alanLine = output.split('\n').find((l) => l.includes('Alan Grant')) ?? ''
        const ellieLine = output.split('\n').find((l) => l.includes('Ellie Sattler')) ?? ''
        expect(alanLine).toContain('*')
        expect(ellieLine).not.toContain('*')
    })

    it('omits the accounts block when config.users is empty or absent', async () => {
        presentConfig({ authMode: 'read-write' })
        mockToken('secure-store')
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).not.toContain('Authenticated accounts')
    })

    it('masks per-user fallback tokens in --json output', async () => {
        presentConfig({
            users: [{ ...STORED_ALAN, token: 'tw_userA_plaintext_fallback_123' }, STORED_ELLIE],
            defaultUserId: '1',
        })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.users[0].token).toBe('****…_123')
        expect(parsed.users[0].token).not.toContain('plaintext')
        expect(parsed.users[1]).not.toHaveProperty('token')
    })

    it('--show-token reveals per-user fallback tokens', async () => {
        presentConfig({ users: [{ ...STORED_ALAN, token: 'tw_userA_plaintext_fallback_123' }] })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view', '--json', '--show-token'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.users[0].token).toBe('tw_userA_plaintext_fallback_123')
    })

    it('shows the user settings section', async () => {
        presentConfig({ userSettings: { unarchiveNewThreads: true } })
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = captureConsole()

        await createProgram().parseAsync(['node', 'tw', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('User settings')
        expect(output).toContain('Unarchive new threads')
        expect(output).toContain('true')
    })
})

describe('config set', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSetConfig.mockResolvedValue()
    })

    it('writes userSettings.unarchiveNewThreads = true', async () => {
        mockReadConfigStrict.mockResolvedValue({ state: 'present', config: {} })
        const consoleSpy = captureConsole()

        await createProgram().parseAsync([
            'node',
            'tw',
            'config',
            'set',
            'unarchive-new-threads',
            'true',
        ])

        expect(mockSetConfig).toHaveBeenCalledWith({
            userSettings: { unarchiveNewThreads: true },
        })
        const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n')
        expect(output).toContain('userSettings.unarchiveNewThreads = true')
    })

    it('writes false for off/0/no', async () => {
        mockReadConfigStrict.mockResolvedValue({
            state: 'present',
            config: { userSettings: { unarchiveNewThreads: true } },
        })
        captureConsole()

        await createProgram().parseAsync([
            'node',
            'tw',
            'config',
            'set',
            'unarchive-new-threads',
            'off',
        ])

        expect(mockSetConfig).toHaveBeenCalledWith({
            userSettings: { unarchiveNewThreads: false },
        })
    })

    it('preserves other userSettings keys when updating', async () => {
        mockReadConfigStrict.mockResolvedValue({
            state: 'present',
            config: {
                userSettings: { unarchiveNewThreads: false },
                currentWorkspace: 7,
            } as Config,
        })
        captureConsole()

        await createProgram().parseAsync([
            'node',
            'tw',
            'config',
            'set',
            'unarchive-new-threads',
            'true',
        ])

        expect(mockSetConfig).toHaveBeenCalledWith({
            userSettings: { unarchiveNewThreads: true },
            currentWorkspace: 7,
        })
    })

    it('rejects unknown keys', async () => {
        mockReadConfigStrict.mockResolvedValue({ state: 'present', config: {} })

        await expect(
            createProgram().parseAsync(['node', 'tw', 'config', 'set', 'nope', 'true']),
        ).rejects.toBeInstanceOf(CliError)
        expect(mockSetConfig).not.toHaveBeenCalled()
    })

    it('rejects invalid boolean values', async () => {
        mockReadConfigStrict.mockResolvedValue({ state: 'present', config: {} })

        await expect(
            createProgram().parseAsync([
                'node',
                'tw',
                'config',
                'set',
                'unarchive-new-threads',
                'maybe',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_VALUE' })
        expect(mockSetConfig).not.toHaveBeenCalled()
    })

    it('writes a fresh config when the file is missing', async () => {
        mockReadConfigStrict.mockResolvedValue({ state: 'missing' })
        captureConsole()

        await createProgram().parseAsync([
            'node',
            'tw',
            'config',
            'set',
            'unarchive-new-threads',
            'true',
        ])

        expect(mockSetConfig).toHaveBeenCalledWith({
            userSettings: { unarchiveNewThreads: true },
        })
    })

    it('refuses to overwrite a malformed config file', async () => {
        mockReadConfigStrict.mockRejectedValue(new CliError('CONFIG_INVALID_JSON', 'broken'))

        await expect(
            createProgram().parseAsync([
                'node',
                'tw',
                'config',
                'set',
                'unarchive-new-threads',
                'true',
            ]),
        ).rejects.toMatchObject({ code: 'CONFIG_INVALID_JSON' })
        expect(mockSetConfig).not.toHaveBeenCalled()
    })
})
