import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeMocks = vi.hoisted(() => ({
    set: vi.fn(),
    clear: vi.fn(),
    active: vi.fn(),
    list: vi.fn(),
    setDefault: vi.fn(),
    getLastStorageResult: vi.fn(),
    getLastClearResult: vi.fn(),
}))

vi.mock('../../lib/auth-provider.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-provider.js')>()
    return {
        ...actual,
        createTwistTokenStore: () => storeMocks,
    }
})

vi.mock('chalk')

import { type TwistAccount } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { registerAccountCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAccountCommand(program)
    return program
}

const ACCOUNT_A: TwistAccount = {
    id: '1',
    label: 'Ada Lovelace',
    authMode: 'read-write',
    authScope: 'user:read',
}

const ACCOUNT_B: TwistAccount = {
    id: '2',
    label: 'Bob Smith',
    authMode: 'read-only',
    authScope: 'user:read',
}

describe('account command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        vi.unstubAllEnvs()
    })

    describe('list subcommand', () => {
        it('renders all stored accounts with the default marker', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: true },
                { account: ACCOUNT_B, isDefault: false },
            ])

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain('Stored accounts (2)')
            expect(output).toContain('id:1')
            expect(output).toContain('Ada Lovelace')
            expect(output).toContain('id:2')
            expect(output).toContain('Bob Smith')
            expect(output).toContain('Default: id:1  Ada Lovelace')
        })

        it('runs by default when no subcommand is given', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])

            await createProgram().parseAsync(['node', 'tw', 'account'])

            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain('Stored accounts (1)')
        })

        it('reports the empty state when no accounts are stored', async () => {
            storeMocks.list.mockResolvedValue([])

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            expect(consoleSpy).toHaveBeenCalledWith(
                'No stored accounts. Run `tw auth login` to add one.',
            )
        })

        it('emits a JSON envelope with id, label, isDefault', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: true },
                { account: ACCOUNT_B, isDefault: false },
            ])

            await createProgram().parseAsync(['node', 'tw', 'account', 'list', '--json'])

            const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            expect(parsed).toEqual([
                { id: '1', label: 'Ada Lovelace', isDefault: true },
                { id: '2', label: 'Bob Smith', isDefault: false },
            ])
        })
    })

    describe('current subcommand', () => {
        it('renders the active account from store.active()', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({ token: 'tk_abc', account: ACCOUNT_A })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain('Active account: id:1  Ada Lovelace')
            expect(output).toContain('Mode:  read-write')
            expect(output).toContain('Scope: user:read')
        })

        it('reports env-sourced tokens without inventing an account', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, 'tk_env_supplied')

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain(TOKEN_ENV_VAR)
            expect(output).toContain('no stored account')
            expect(storeMocks.active).not.toHaveBeenCalled()
        })

        it('throws NO_TOKEN when nothing is active', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue(null)

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'current']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')
        })

        it('emits a JSON envelope with the active account fields', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({ token: 'tk_abc', account: ACCOUNT_A })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current', '--json'])

            const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
            expect(parsed).toEqual({
                id: '1',
                label: 'Ada Lovelace',
                authMode: 'read-write',
                authScope: 'user:read',
                source: 'config',
            })
        })
    })

    describe('use subcommand', () => {
        it('sets the default account when the ref matches', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: true },
            ])
            storeMocks.setDefault.mockResolvedValue(undefined)

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', '1'])

            expect(storeMocks.setDefault).toHaveBeenCalledWith('1')
            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain('Default account set to id:1')
            expect(output).toContain('Ada Lovelace')
        })

        it('rejects unknown refs with ACCOUNT_NOT_FOUND before touching the store', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'use', '999']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')

            expect(storeMocks.setDefault).not.toHaveBeenCalled()
        })

        it('matches refs by display name (case-insensitive)', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: true },
            ])
            storeMocks.setDefault.mockResolvedValue(undefined)

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', 'ada lovelace'])

            expect(storeMocks.setDefault).toHaveBeenCalledWith('ada lovelace')
        })
    })

    describe('remove subcommand', () => {
        it('clears the account when the ref matches and prints the removed label', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: true },
                { account: ACCOUNT_B, isDefault: false },
            ])
            storeMocks.clear.mockResolvedValue(undefined)
            storeMocks.getLastClearResult.mockReturnValue({ storage: 'secure-store' })

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', '2'])

            expect(storeMocks.clear).toHaveBeenCalledWith('2')
            const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
            expect(output).toContain('Removed account id:2')
            expect(output).toContain('Bob Smith')
        })

        it('rejects unknown refs with ACCOUNT_NOT_FOUND before clearing', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'remove', '999']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')

            expect(storeMocks.clear).not.toHaveBeenCalled()
        })

        it('surfaces keyring-fallback warnings on stderr', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])
            storeMocks.clear.mockResolvedValue(undefined)
            storeMocks.getLastClearResult.mockReturnValue({
                storage: 'config-file',
                warning: 'system credential manager unavailable; local auth state cleared',
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', '1'])

            expect(errorSpy).toHaveBeenCalledWith(
                'Warning:',
                'system credential manager unavailable; local auth state cleared',
            )
        })

        it('emits a JSON envelope and suppresses the plain confirmation', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])
            storeMocks.clear.mockResolvedValue(undefined)
            storeMocks.getLastClearResult.mockReturnValue({ storage: 'secure-store' })

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', '1', '--json'])

            const stdoutLines = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0]))
            expect(stdoutLines).toHaveLength(1)
            expect(JSON.parse(stdoutLines[0])).toEqual({
                id: '1',
                label: 'Ada Lovelace',
                removed: true,
            })
        })
    })
})
