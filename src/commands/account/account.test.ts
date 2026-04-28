import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        listStoredAccounts: vi.fn(),
        setDefaultAccountId: vi.fn(),
    }
})

vi.mock('../../lib/config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/config.js')>()
    return {
        ...actual,
        getConfig: vi.fn(),
    }
})

vi.mock('chalk')

import { listStoredAccounts, setDefaultAccountId } from '../../lib/auth.js'
import { getConfig } from '../../lib/config.js'
import { registerAccountCommand } from './index.js'

const mockListStoredAccounts = vi.mocked(listStoredAccounts)
const mockSetDefaultAccountId = vi.mocked(setDefaultAccountId)
const mockGetConfig = vi.mocked(getConfig)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAccountCommand(program)
    return program
}

describe('account command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockGetConfig.mockResolvedValue({})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    describe('list', () => {
        it('prints a hint when no accounts are stored', async () => {
            mockListStoredAccounts.mockResolvedValue([])
            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            expect(consoleSpy.mock.calls.flat().join('\n')).toContain('No stored Twist accounts')
        })

        it('marks the default account', async () => {
            mockListStoredAccounts.mockResolvedValue([
                { id: '1', email: 'a@b.c', name: 'Alice' },
                { id: '2', email: 'd@e.f', name: 'Dan' },
            ])
            mockGetConfig.mockResolvedValue({
                configVersion: 2,
                account: { defaultAccount: '2' },
                accounts: [],
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'list'])

            const lines = consoleSpy.mock.calls.flat().join('\n')
            expect(lines).toContain('a@b.c')
            expect(lines).toContain('d@e.f')
            expect(lines).toContain('default')
        })

        it('outputs JSON when --json given', async () => {
            mockListStoredAccounts.mockResolvedValue([
                { id: '1', email: 'a@b.c', authMode: 'read-write' },
            ])
            mockGetConfig.mockResolvedValue({
                configVersion: 2,
                account: { defaultAccount: '1' },
                accounts: [],
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'list', '--json'])

            const printed = consoleSpy.mock.calls[0][0] as string
            const payload = JSON.parse(printed)
            expect(payload[0]).toMatchObject({
                id: '1',
                email: 'a@b.c',
                isDefault: true,
                authMode: 'read-write',
                storage: 'secure-store',
            })
        })
    })

    describe('use', () => {
        it('sets the default account by id', async () => {
            mockGetConfig.mockResolvedValue({
                configVersion: 2,
                accounts: [{ id: '111', email: 'a@b.c' }],
            })

            await createProgram().parseAsync(['node', 'tw', 'account', 'use', '111'])

            expect(mockSetDefaultAccountId).toHaveBeenCalledWith('111')
        })

        it('rejects an unknown ref', async () => {
            mockGetConfig.mockResolvedValue({
                configVersion: 2,
                accounts: [{ id: '111', email: 'a@b.c' }],
            })

            await expect(
                createProgram().parseAsync(['node', 'tw', 'account', 'use', 'nope']),
            ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
        })
    })
})
