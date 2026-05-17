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

import { ACCOUNT_ALAN, ACCOUNT_ELLIE } from '../../lib/__fixtures__/accounts.js'
import { type TwistAccount } from '../../lib/auth-provider.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { registerAccountCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAccountCommand(program)
    return program
}

/** Seed `store.list()` and `store.setDefault/clear` resolvers in one call. */
function seedStore(...records: Array<TwistAccount | [TwistAccount, 'default']>): void {
    const list = records.map((spec) =>
        Array.isArray(spec)
            ? { account: spec[0], isDefault: true }
            : { account: spec, isDefault: false },
    )
    storeMocks.list.mockResolvedValue(list)
    storeMocks.setDefault.mockResolvedValue(undefined)
    storeMocks.clear.mockResolvedValue(undefined)
    storeMocks.getLastClearResult.mockReturnValue({ storage: 'secure-store' })
}

const LEGACY_SNAPSHOT = {
    token: 'tk_legacy',
    account: { id: '', label: '', authMode: 'unknown' as const, authScope: '' },
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
            seedStore([ACCOUNT_ALAN, 'default'], ACCOUNT_ELLIE)

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            const output = stdout()
            expect(output).toContain('Stored accounts (2)')
            expect(output).toContain('id:1')
            expect(output).toContain('Alan Grant')
            expect(output).toContain('id:2')
            expect(output).toContain('Ellie Sattler')
            expect(output).toContain('Default: id:1  Alan Grant')
        })

        it('runs by default when no subcommand is given (tw account)', async () => {
            seedStore([ACCOUNT_ALAN, 'default'])

            await createProgram().parseAsync(['node', 'tw', 'account'])

            expect(stdout()).toContain('Stored accounts (1)')
        })

        it('reports the empty state when no accounts are stored', async () => {
            seedStore()

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            expect(consoleSpy).toHaveBeenCalledWith(
                'No stored accounts. Run `tw auth login` to add one.',
            )
        })

        it('emits a JSON envelope with id, label, isDefault', async () => {
            seedStore([ACCOUNT_ALAN, 'default'], ACCOUNT_ELLIE)

            await createProgram().parseAsync(['node', 'tw', 'account', 'list', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual([
                { id: '1', label: 'Alan Grant', isDefault: true },
                { id: '2', label: 'Ellie Sattler', isDefault: false },
            ])
        })
    })

    describe('current', () => {
        it('renders the active account from store.active()', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue({ token: 'tk_abc', account: ACCOUNT_ALAN })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            const output = stdout()
            expect(output).toContain('Active account: id:1  Alan Grant')
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
            storeMocks.active.mockResolvedValue(LEGACY_SNAPSHOT)

            await createProgram().parseAsync(['node', 'tw', 'account', 'current'])

            expect(stdout()).toContain('legacy single-user session')
        })

        it('emits {source:"legacy"} in --json mode for legacy snapshots', async () => {
            vi.stubEnv(TOKEN_ENV_VAR, '')
            storeMocks.active.mockResolvedValue(LEGACY_SNAPSHOT)

            await createProgram().parseAsync(['node', 'tw', 'account', 'current', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({ source: 'legacy' })
        })

        it('reports a populated legacy snapshot (authUserId set) as legacy, not config', async () => {
            // `readLegacyTokenSnapshot` populates id/label from v1 flat
            // fields when present, so the empty-id check alone misses this
            // case — `isLegacyAuthActive()` is the authoritative signal.
            vi.stubEnv(TOKEN_ENV_VAR, '')
            legacyMocks.isLegacyAuthActive.mockResolvedValue(true)
            storeMocks.active.mockResolvedValue({ token: 'tk_legacy', account: ACCOUNT_ALAN })

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
            storeMocks.active.mockResolvedValue({ token: 'tk_abc', account: ACCOUNT_ALAN })

            await createProgram().parseAsync(['node', 'tw', 'account', 'current', '--json'])

            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                id: '1',
                label: 'Alan Grant',
                authMode: 'read-write',
                authScope: 'user:read',
                source: 'config',
            })
        })
    })

    describe('use', () => {
        it('sets the default account by canonical id when the ref matches', async () => {
            seedStore(ACCOUNT_ALAN, [ACCOUNT_ELLIE, 'default'])

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', '1'])

            expect(storeMocks.setDefault).toHaveBeenCalledTimes(1)
            expect(storeMocks.setDefault).toHaveBeenCalledWith('1')
            const output = stdout()
            expect(output).toContain('Default account set to')
            expect(output).toContain('Alan Grant')
        })

        it('rejects unknown refs with ACCOUNT_NOT_FOUND before touching the store', async () => {
            seedStore([ACCOUNT_ALAN, 'default'])

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'use', '999']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')

            expect(storeMocks.setDefault).not.toHaveBeenCalled()
        })

        it('matches refs by display name and resolves to the canonical id', async () => {
            seedStore(ACCOUNT_ALAN, [ACCOUNT_ELLIE, 'default'])

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', 'alan grant'])

            expect(storeMocks.setDefault).toHaveBeenCalledTimes(1)
            const output = stdout()
            expect(output).toContain('Alan Grant')
            expect(output).not.toContain('Ellie Sattler')
        })
    })

    describe('remove', () => {
        it('clears the account by canonical id and prints the removed label', async () => {
            seedStore([ACCOUNT_ALAN, 'default'], ACCOUNT_ELLIE)

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', 'ellie sattler'])

            expect(storeMocks.clear).toHaveBeenCalledTimes(1)
            expect(storeMocks.clear).toHaveBeenCalledWith('2')
            const output = stdout()
            expect(output).toContain('Removed account')
            expect(output).toContain('Ellie Sattler')
        })

        it('rejects unknown refs with ACCOUNT_NOT_FOUND before clearing', async () => {
            seedStore([ACCOUNT_ALAN, 'default'])

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'remove', '999']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')

            expect(storeMocks.clear).not.toHaveBeenCalled()
        })

        it('surfaces keyring-fallback warnings on stderr', async () => {
            seedStore([ACCOUNT_ALAN, 'default'])
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
            seedStore([ACCOUNT_ALAN, 'default'])

            await createProgram().parseAsync(['node', 'tw', 'account', 'remove', '1', '--json'])

            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(JSON.parse(consoleSpy.mock.calls[0][0] as string)).toEqual({
                id: '1',
                label: 'Alan Grant',
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
