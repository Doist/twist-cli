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

const legacyMocks = vi.hoisted(() => ({
    isLegacyAuthActive: vi.fn(),
}))

vi.mock('../../lib/auth-provider.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-provider.js')>()
    return {
        ...actual,
        createTwistTokenStore: () => storeMocks,
        isLegacyAuthActive: legacyMocks.isLegacyAuthActive,
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
        legacyMocks.isLegacyAuthActive.mockResolvedValue(false)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        vi.unstubAllEnvs()
    })

    const stdout = () => consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')

    describe('list', () => {
        it('renders all stored accounts with the default marker', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: true },
                { account: ACCOUNT_B, isDefault: false },
            ])

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            const output = stdout()
            expect(output).toContain('Stored accounts (2)')
            expect(output).toContain('id:1')
            expect(output).toContain('Ada Lovelace')
            expect(output).toContain('id:2')
            expect(output).toContain('Bob Smith')
            expect(output).toContain('Default: id:1  Ada Lovelace')
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

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual([
                { id: '1', label: 'Ada Lovelace', isDefault: true },
                { id: '2', label: 'Bob Smith', isDefault: false },
            ])
        })
    })

    describe('current', () => {
        it('renders the active account from store.active()', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({ token: 'tk_abc', account: ACCOUNT_A })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            const output = stdout()
            expect(output).toContain('Active account: id:1  Ada Lovelace')
            expect(output).toContain('Mode:  read-write')
            expect(output).toContain('Scope: user:read')
        })

        it.each([['--json'], ['--ndjson']])(
            'emits {source:"env"} in %s mode without touching store.active',
            async (flag) => {
                vi.stubEnv(TOKEN_ENV_VAR, 'tk_env_supplied')

                await createProgram().parseAsync(['node', 'tw', 'account', 'current', flag])

                expect(consoleSpy).toHaveBeenCalledTimes(1)
                expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({ source: 'env' })
                expect(storeMocks.active).not.toHaveBeenCalled()
            },
        )

        it('renders a legacy-session notice when active() returns an empty-id snapshot', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({
                token: 'tk_legacy',
                account: { id: '', label: '', authMode: 'unknown', authScope: '' },
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            expect(stdout()).toContain('legacy single-user session')
        })

        it('emits {source:"legacy"} in --json mode for legacy snapshots', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({
                token: 'tk_legacy',
                account: { id: '', label: '', authMode: 'unknown', authScope: '' },
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({ source: 'legacy' })
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

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                id: '1',
                label: 'Ada Lovelace',
                authMode: 'read-write',
                authScope: 'user:read',
                source: 'config',
            })
        })
    })

    describe('use', () => {
        it('sets the default account by canonical id when the ref matches', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: true },
            ])
            storeMocks.setDefault.mockResolvedValue(undefined)

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', '1'])

            expect(storeMocks.setDefault).toHaveBeenCalledTimes(1)
            expect(storeMocks.setDefault).toHaveBeenCalledWith('1')
            const output = stdout()
            expect(output).toContain('Default account set to')
            expect(output).toContain('Ada Lovelace')
        })

        it('rejects unknown refs with ACCOUNT_NOT_FOUND before touching the store', async () => {
            storeMocks.list.mockResolvedValue([{ account: ACCOUNT_A, isDefault: true }])

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'use', '999']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')

            expect(storeMocks.setDefault).not.toHaveBeenCalled()
        })

        it('matches refs by display name and resolves to the canonical id', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: true },
            ])
            storeMocks.setDefault.mockResolvedValue(undefined)

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', 'ada lovelace'])

            expect(storeMocks.setDefault).toHaveBeenCalledTimes(1)
            const output = stdout()
            expect(output).toContain('Ada Lovelace')
            expect(output).not.toContain('Bob Smith')
        })
    })

    describe('remove', () => {
        it('clears the account by canonical id and prints the removed label', async () => {
            storeMocks.list.mockResolvedValue([
                { account: ACCOUNT_A, isDefault: true },
                { account: ACCOUNT_B, isDefault: false },
            ])
            storeMocks.clear.mockResolvedValue(undefined)
            storeMocks.getLastClearResult.mockReturnValue({ storage: 'secure-store' })

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', 'bob smith'])

            expect(storeMocks.clear).toHaveBeenCalledTimes(1)
            expect(storeMocks.clear).toHaveBeenCalledWith('2')
            const output = stdout()
            expect(output).toContain('Removed account')
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

            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                id: '1',
                label: 'Ada Lovelace',
                removed: true,
            })
        })
    })

    // One per gated command — assertV2Available is shared, but a regression
    // could remove the guard from any single handler.
    describe.each([
        ['list', ['list']],
        ['use', ['use', '1']],
        ['remove', ['remove', '1']],
    ])('%s refuses while legacy auth is still active', (_name, args) => {
        it('throws AUTH_MIGRATION_PENDING without touching the store', async () => {
            legacyMocks.isLegacyAuthActive.mockResolvedValue(true)

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', ...args]),
            ).rejects.toHaveProperty('code', 'AUTH_MIGRATION_PENDING')

            expect(storeMocks.list).not.toHaveBeenCalled()
            expect(storeMocks.setDefault).not.toHaveBeenCalled()
            expect(storeMocks.clear).not.toHaveBeenCalled()
        })
    })
})
